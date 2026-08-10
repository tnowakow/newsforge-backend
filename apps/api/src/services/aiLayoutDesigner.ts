/**
 * v3 — AI layout designer.
 *
 * In v2, "AI generation" meant: Gemini picks a template id, a greedy fitter
 * places content, and the vibrant demo look was hardcoded per-client in
 * renderHtml.ts. v3 replaces that: Gemini receives the content, the brand
 * kit, the template skeleton, and the house DESIGN_LANGUAGE_PROMPT, and
 * returns the full styled AssembledLayout (panels, colored headers, list
 * blocks, captions).
 *
 * Safety net (Vitaly rule 14 preserved): if Gemini and the OpenAI backup are
 * unavailable, time out, fail schema validation, or return broken references,
 * we fall back to the deterministic fitter — and EITHER path is finished by
 * applyVibrancyPass, so output is always styled.
 */
import { z } from "zod";
import {
  LayoutBlockSchema,
  type Article,
  type AssembledLayout,
  type BrandKit,
  type GridSpec,
  type LayoutBlock,
  type NewsImage,
  type RecurringSection,
} from "@newsforge/shared/schemas";
import { callGeminiJson } from "../gemini.js";
import { assembleLayout } from "./layoutAssembly.js";
import { applyVibrancyPass } from "./vibrancyPass.js";
import { DESIGN_LANGUAGE_PROMPT } from "./designLanguage.js";
import {
  applyCandidateMeasurements,
  buildAdaptiveLayout,
  chooseAdaptiveCandidate,
  expandPhotoBand,
  type AdaptiveLayoutCandidate,
  type EditorialPlan,
} from "./adaptiveLayoutPlanner.js";
import { measureAdaptiveCandidates } from "./layoutMeasurementService.js";
import {
  scorePorterOneReferenceAffinity,
} from "./porterOneReferenceScorer.js";
import type { CandidateMeasurement } from "./adaptiveLayoutPlanner.js";

/** Layout design returns full spread JSON; production smokes can take 30-75s. */
const DESIGN_TIMEOUT_MS = 90_000;

const AiDesignResponseSchema = z.object({
  // Parse Gemini's layout response loosely first. We normalize/validate every
  // block below so one omitted audit-ish field does not reject the whole layout.
  blocks: z.array(z.unknown()).min(1),
  designNotes: z.string().optional(),
});

export interface DesignLayoutInput {
  templateId: string;
  pageCount: number;
  gridSpec: GridSpec;
  articles: Article[];
  images: NewsImage[];
  recurringSections: RecurringSection[];
  brandVoice: string;
  brandKit: BrandKit;
  clientName: string;
  monthLabel?: string;
  previousVersion?: number;
  variationSeed?: string;
}

export interface DesignLayoutResult {
  layout: AssembledLayout;
  /** Articles may be sentence-trimmed by measured AI repair before persistence. */
  articles?: Article[];
  mode: "ai" | "deterministic";
  designNotes?: string;
  fallbackReason?: string;
  editorialPlan?: EditorialPlan;
  adaptiveCandidates?: Array<Omit<AdaptiveLayoutCandidate, "layout"> & { selected?: boolean }>;
  promptAudit: {
    systemPrompt: string;
    userPrompt: string;
    provider: "gemini" | "openai" | "deterministic";
    model: string;
    durationMs: number;
  };
}

function excerpt(body: string, max = 220): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length <= max
    ? clean
    : `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** Drop blocks whose content references don't exist; clamp geometry. */
export function normalizeAiLayoutBlocks(
  rawBlocks: unknown[],
  skeleton: AssembledLayout,
): LayoutBlock[] {
  return rawBlocks.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const block = raw as Record<string, unknown>;
    const blockId =
      typeof block.blockId === "string" && block.blockId.trim()
        ? block.blockId
        : `ai-block-${index + 1}`;
    const skeletonBlock = skeleton.blocks.find((b) => b.blockId === blockId);
    const candidate = {
      ...block,
      blockId,
      slotId:
        typeof block.slotId === "string" && block.slotId.trim()
          ? block.slotId
          : skeletonBlock?.slotId ?? blockId,
    };
    const parsed = LayoutBlockSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}

function sanitizeBlocks(
  blocks: LayoutBlock[],
  input: DesignLayoutInput,
): LayoutBlock[] {
  const articleIds = new Set(input.articles.map((a) => a.id));
  const imageIds = new Set(input.images.map((i) => i.id));
  const cols = input.gridSpec.columns;
  const seenArticles = new Set<string>();
  const seenImages = new Set<string>();

  const kept = blocks.filter((b) => {
    if (b.page < 1 || b.page > input.pageCount) return false;
    if (b.articleId) {
      if (!articleIds.has(b.articleId)) return false;
      if (seenArticles.has(b.articleId)) return false;
      seenArticles.add(b.articleId);
    }
    if (b.imageId) {
      if (!imageIds.has(b.imageId)) return false;
      if (seenImages.has(b.imageId)) return false; // no duplicate placements
      seenImages.add(b.imageId);
    }
    return true;
  });

  return kept.map((b) => {
    const colSpan = Math.min(Math.max(1, b.position.colSpan), cols);
    const col = Math.min(Math.max(1, b.position.col), cols - colSpan + 1);
    const rowSpan = Math.min(Math.max(1, b.position.rowSpan), input.gridSpec.rowsPerPage);
    const row = Math.min(
      Math.max(1, b.position.row),
      input.gridSpec.rowsPerPage - rowSpan + 1,
    );
    return {
      ...b,
      position: {
        ...b.position,
        col,
        colSpan,
        row,
        rowSpan,
      },
    };
  });
}

function trimArticleForRepair(text: string, ratio: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const keep = Math.max(12, Math.floor(words.length * ratio));
  const trimmed = words.slice(0, keep).join(" ").replace(/[,:;—-]\s*$/, "");
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Repair only the measured offenders; never throw away the whole AI spread
 * because a few text boxes are one step too tall. */
function repairClippedAiLayout(
  layout: AssembledLayout,
  articles: Article[],
  measurement: CandidateMeasurement,
  attempt: number,
): { layout: AssembledLayout; articles: Article[]; changed: boolean } {
  const clipped = new Set(measurement.clippedBlockIds ?? []);
  if (clipped.size === 0) return { layout, articles, changed: false };
  const nextArticles = articles.map((article) => ({ ...article }));
  const byId = new Map(nextArticles.map((article) => [article.id, article]));
  let changed = false;
  const blocks = layout.blocks.map((block) => {
    if (!clipped.has(block.blockId)) return block;
    const style = { ...(block.style ?? {}), copyFit: "sm" as const };
    if (attempt >= 1 && block.articleId) {
      const article = byId.get(block.articleId);
      if (article && article.body.split(/\s+/).length > 18) {
        article.body = trimArticleForRepair(article.body, 0.9);
        article.wordCount = article.body.split(/\s+/).filter(Boolean).length;
      }
    }
    changed = true;
    return { ...block, style };
  });
  return { layout: { ...layout, blocks }, articles: nextArticles, changed };
}

function qualityScore(
  layout: AssembledLayout,
  measurement: CandidateMeasurement | undefined,
  gridSpec: GridSpec,
): number {
  const reference = scorePorterOneReferenceAffinity(layout, gridSpec);
  const useful = measurement?.usefulOccupancy ?? 0;
  const coverage = measurement?.geometricCoverage ?? 0;
  const pageUtility = measurement?.minPageUtility ?? 0;
  const renderFit = measurement
    ? Math.max(0, 1 - measurement.clippedBlocks * 0.015 - measurement.overflowBlocks * 0.2 - measurement.missingImages * 0.2)
    : 0;
  const clipPenalty = Math.min(0.12, (measurement?.clippedBlocks ?? 0) * 0.015);
  const emptyPenalty = Math.max(0, (measurement?.largestEmptyBandRatio ?? 0) - 0.28) * 0.35;
  return Math.max(0, Math.min(1,
    reference.affinity * 0.45 + useful * 0.2 + coverage * 0.15 + pageUtility * 0.1 + renderFit * 0.1 - clipPenalty - emptyPenalty,
  ));
}

/** Append any images the AI forgot into remaining image-ish space. */
function reattachMissingImages(
  blocks: LayoutBlock[],
  input: DesignLayoutInput,
): LayoutBlock[] {
  const placed = new Set(blocks.filter((b) => b.imageId).map((b) => b.imageId));
  const missing = input.images.filter((i) => !placed.has(i.id));
  if (missing.length === 0) return blocks;

  const out = [...blocks];
  const findOpenRect = (page: number, preferredColSpan: number, preferredRowSpan: number) => {
    const occupied = new Set<string>();
    for (const block of out.filter((b) => b.page === page)) {
      const colEnd = Math.min(input.gridSpec.columns, block.position.col + block.position.colSpan - 1);
      const rowEnd = Math.min(input.gridSpec.rowsPerPage, block.position.row + block.position.rowSpan - 1);
      for (let col = block.position.col; col <= colEnd; col++) {
        for (let row = block.position.row; row <= rowEnd; row++) {
          occupied.add(`${col}:${row}`);
        }
      }
    }
    const sizes = [
      [preferredColSpan, preferredRowSpan],
      [Math.min(6, input.gridSpec.columns), 3],
      [Math.min(8, input.gridSpec.columns), 2],
      [Math.min(5, input.gridSpec.columns), 2],
    ];
    for (const [colSpan, rowSpan] of sizes) {
      for (let row = 1; row <= input.gridSpec.rowsPerPage - rowSpan + 1; row++) {
        for (let col = 1; col <= input.gridSpec.columns - colSpan + 1; col++) {
          let open = true;
          for (let c = col; c < col + colSpan && open; c++) {
            for (let r = row; r < row + rowSpan; r++) {
              if (occupied.has(`${c}:${r}`)) {
                open = false;
                break;
              }
            }
          }
          if (open) return { col, row, colSpan, rowSpan };
        }
      }
    }
    return null;
  };

  // First reuse empty/needsFiller image slots, then use actual open grid space.
  // Never append below the page grid; that looked "placed" in data while
  // rendering as overflow and dead whitespace.
  for (const img of missing) {
    const idx = out.findIndex(
      (b) => !b.imageId && !b.articleId && (b.kind === "empty" || b.needsFiller),
    );
    if (idx !== -1) {
      out[idx] = { ...out[idx], kind: "image", imageId: img.id, needsFiller: false };
      continue;
    }
    const placement = Array.from({ length: input.pageCount }, (_, i) => i + 1)
      .map((page) => ({ page, position: findOpenRect(page, Math.min(8, input.gridSpec.columns), 3) }))
      .find((candidate) => candidate.position);
    if (!placement?.position) continue;
    out.push({
      blockId: `reattach-${img.id}`,
      slotId: `reattach-${img.id}`,
      page: placement.page,
      position: placement.position,
      kind: "image",
      imageId: img.id,
      needsFiller: false,
      zIndex: 0,
    });
  }
  return out;
}

export async function designLayout(
  input: DesignLayoutInput,
): Promise<DesignLayoutResult> {
  const adaptive = buildAdaptiveLayout(input);
  let adaptiveCandidates = adaptive.candidates;
  let adaptiveChosen = adaptive.chosen;
  try {
    const measurements = await measureAdaptiveCandidates({
      clientName: input.clientName,
      monthLabel: input.monthLabel ?? "Newsletter",
      brandKit: input.brandKit,
      gridSpec: input.gridSpec,
      articles: input.articles,
      images: input.images,
      recurringSections: input.recurringSections,
      candidates: adaptive.candidates,
    });
    adaptiveCandidates = applyCandidateMeasurements(adaptive.candidates, measurements);
    adaptiveChosen = chooseAdaptiveCandidate(adaptiveCandidates, input.variationSeed);
  } catch (err) {
    console.warn("[layout-measurement] candidate measurement skipped:", err);
  }
  const adaptiveCandidateReport = adaptiveCandidates.map(({ layout: _layout, ...candidate }) => ({
    ...candidate,
    selected: candidate.id === adaptiveChosen.id,
  }));
  const deterministic = () =>
    applyVibrancyPass({
      layout: adaptiveChosen.layout,
      articles: input.articles,
      images: input.images,
      visualPersonality: adaptive.plan.visualPersonality,
    });

  // Skeleton blocks from the template give the model stable blockIds to keep.
  const skeleton = assembleLayout({
    templateId: input.templateId,
    pageCount: input.pageCount,
    gridSpec: input.gridSpec,
    articles: input.articles,
    images: input.images,
    recurringSections: input.recurringSections,
    previousVersion: input.previousVersion,
  });

  const systemPrompt = DESIGN_LANGUAGE_PROMPT.replace(
    /\{columns\}/g,
    String(input.gridSpec.columns),
  ).replace(/\{rows\}/g, String(input.gridSpec.rowsPerPage));

  const userPrompt = JSON.stringify({
    client: input.clientName,
    brandVoice: input.brandVoice,
    monthLabel: input.monthLabel ?? null,
    grid: {
      columns: input.gridSpec.columns,
      rowsPerPage: input.gridSpec.rowsPerPage,
      pageCount: input.pageCount,
    },
    articles: input.articles.map((a) => ({
      id: a.id,
      title: a.title,
      wordCount: a.wordCount,
      articleType: a.articleType ?? null,
      excerpt: excerpt(a.body),
    })),
    editorialPlan: {
      photoGoal: adaptive.plan.photoGoal,
      density: adaptive.plan.density,
      compositionGrammar: adaptive.plan.compositionGrammar,
      visualPersonality: adaptive.plan.visualPersonality,
    },
    porterOneReferenceTarget: {
      goal: "Maximize resemblance to the five real PorterOne originals; the template skeleton is a movable starting point, not the goal.",
      desiredAffinity: 0.98,
      selectionSignals: [
        "many mid-sized editorial modules instead of a few giant boxes",
        "purposeful PorterOne color panels: sun, cream, berry, sky, leaf/coral, navy",
        "several smaller captioned real-life photos clustered near relevant stories",
        "at least one rail, footer band, or feature band anchoring each spread",
        "dense lists and compact copy with no obvious dead panel space",
      ],
    },
    images: input.images.map((i) => ({
      id: i.id,
      aspect: i.aspect,
      caption: i.caption ?? i.alt ?? null,
      description: i.description ?? null,
      tags: i.tags ?? [],
    })),
    startingBlocks: skeleton.blocks,
    respondWith:
      '{ "blocks": [ ...full AssembledLayout blocks; every block must keep blockId and slotId... ], "designNotes": "one sentence" }',
  });

  const fallbackLayout = deterministic();
  const result = await callGeminiJson({
    schema: AiDesignResponseSchema,
    systemPrompt,
    userPrompt,
    timeoutMs: DESIGN_TIMEOUT_MS,
    fallback: { blocks: fallbackLayout.blocks, designNotes: "deterministic" },
  });

  if ("usedFallback" in result && result.usedFallback) {
    return {
      layout: fallbackLayout,
      mode: "deterministic",
      fallbackReason: "reason" in result ? result.reason : "fallback",
      editorialPlan: adaptive.plan,
      adaptiveCandidates: adaptiveCandidateReport,
      promptAudit: {
        systemPrompt,
        userPrompt,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
      },
    };
  }

  let blocks = sanitizeBlocks(
    normalizeAiLayoutBlocks(result.data.blocks, skeleton),
    input,
  );
  if (blocks.length === 0) {
    return {
      layout: fallbackLayout,
      mode: "deterministic",
      fallbackReason: "ai_returned_no_valid_blocks",
      editorialPlan: adaptive.plan,
      adaptiveCandidates: adaptiveCandidateReport,
      promptAudit: {
        systemPrompt,
        userPrompt,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
      },
    };
  }
  blocks = reattachMissingImages(blocks, input);

  let layout: AssembledLayout = expandPhotoBand(applyVibrancyPass({
    layout: {
      ...skeleton,
      blocks,
      unfilledSlotIds: blocks.filter((b) => b.needsFiller).map((b) => b.slotId),
      stats: {
        placedArticles: blocks.filter((b) => b.articleId).length,
        placedImages: blocks.filter((b) => b.imageId).length,
        fillerBlocks: blocks.filter((b) => b.needsFiller).length,
        emptySlots: blocks.filter((b) => b.kind === "empty").length,
      },
    },
    articles: input.articles,
    images: input.images,
    visualPersonality: adaptive.plan.visualPersonality,
  }));

  try {
    const measureAi = async (
      candidateLayout: AssembledLayout,
      candidateArticles: Article[],
    ): Promise<CandidateMeasurement | undefined> => {
      const [measurement] = await measureAdaptiveCandidates({
        clientName: input.clientName,
        monthLabel: input.monthLabel ?? "Newsletter",
        brandKit: input.brandKit,
        gridSpec: input.gridSpec,
        articles: candidateArticles,
        images: input.images,
        recurringSections: input.recurringSections,
        candidates: [{
          id: "ai-returned-layout",
          label: "AI returned layout",
          geometryVariant: "fixed",
          layout: candidateLayout,
          score: 0,
          subscores: {
            occupancy: 0,
            contentCoverage: 0,
            requiredCoverage: 0,
            balance: 0,
            clippingRisk: 0,
            geometryValidity: 0,
            photoImpact: 0,
            grammarAffinity: 0,
          },
          warnings: [],
        }],
      });
      return measurement;
    };

    let repairedArticles = input.articles.map((article) => ({ ...article }));
    let measurement = await measureAi(layout, repairedArticles);
    let repairAttempts = 0;
    while (measurement?.clippedBlocks && repairAttempts < 2) {
      const repaired = repairClippedAiLayout(layout, repairedArticles, measurement, repairAttempts);
      if (!repaired.changed) break;
      layout = repaired.layout;
      repairedArticles = repaired.articles;
      repairAttempts += 1;
      measurement = await measureAi(layout, repairedArticles);
    }

    const placedImageIds = new Set(layout.blocks.map((block) => block.imageId).filter(Boolean));
    const missingPlacements = input.images.filter((image) => !placedImageIds.has(image.id)).length;
    const geometricCoverage = measurement?.geometricCoverage ?? 0;
    const hardFailure =
      !measurement ||
      measurement.overflowBlocks > 0 ||
      measurement.missingImages > 0 ||
      missingPlacements > 0 ||
      geometricCoverage < 0.85;
    const aiAffinity = scorePorterOneReferenceAffinity(layout, input.gridSpec);
    const fallbackMeasurement = adaptiveChosen.measurement;
    const aiScore = qualityScore(layout, measurement, input.gridSpec);
    const fallbackScore = qualityScore(adaptiveChosen.layout, fallbackMeasurement, input.gridSpec);
    if (hardFailure || aiScore + 0.015 < fallbackScore) {
      return {
        layout: fallbackLayout,
        mode: "deterministic",
        articles: input.articles,
        fallbackReason: `ai_layout_rejected_weighted_gate:${[
          measurement ? `clips=${measurement.clippedBlocks}` : "unmeasured",
          measurement ? `overflow=${measurement.overflowBlocks}` : undefined,
          measurement ? `missing=${measurement.missingImages + missingPlacements}` : undefined,
          measurement ? `coverage=${geometricCoverage.toFixed(3)}` : undefined,
          measurement ? `utility=${measurement.usefulOccupancy.toFixed(3)}` : undefined,
          `aiScore=${aiScore.toFixed(3)}`,
          `fallbackScore=${fallbackScore.toFixed(3)}`,
        ].filter(Boolean).join(",")}`,
        editorialPlan: adaptive.plan,
        adaptiveCandidates: adaptiveCandidateReport,
        promptAudit: {
          systemPrompt,
          userPrompt,
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs,
        },
      };
    }
    return {
      layout,
      articles: repairedArticles,
      mode: "ai",
      designNotes: `${result.data.designNotes ?? "AI returned the styled V3 layout."} Accepted after ${repairAttempts} measured repair pass${repairAttempts === 1 ? "" : "es"}; PorterOne affinity ${aiAffinity.affinity.toFixed(3)} (${aiAffinity.referenceId}).`,
      editorialPlan: adaptive.plan,
      adaptiveCandidates: adaptiveCandidateReport,
      promptAudit: {
        systemPrompt,
        userPrompt,
        provider: result.provider,
        model: result.model,
        durationMs: result.durationMs,
      },
    };
  } catch (err) {
    console.warn("[layout-measurement] AI returned layout measurement skipped:", err);
  }

  return {
    layout,
    articles: input.articles,
    mode: "ai",
    designNotes:
      result.data.designNotes ??
      (result.provider === "openai"
        ? "OpenAI backup returned the styled V3 layout."
        : "Gemini returned the styled V3 layout."),
    editorialPlan: adaptive.plan,
    adaptiveCandidates: adaptiveCandidateReport,
    promptAudit: {
      systemPrompt,
      userPrompt,
      provider: result.provider,
      model: result.model,
      durationMs: result.durationMs,
    },
  };
}
