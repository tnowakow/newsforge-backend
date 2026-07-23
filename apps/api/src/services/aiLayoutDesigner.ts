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
 * Safety net (Vitaly rule 14 preserved): if Gemini is unavailable, times
 * out, fails schema validation, or returns broken references, we fall back
 * to the deterministic fitter — and EITHER path is finished by
 * applyVibrancyPass, so output is always styled.
 */
import { z } from "zod";
import {
  LayoutBlockSchema,
  type Article,
  type AssembledLayout,
  type GridSpec,
  type LayoutBlock,
  type NewsImage,
  type RecurringSection,
} from "@newsforge/shared/schemas";
import { callGeminiJson } from "../gemini.js";
import { assembleLayout } from "./layoutAssembly.js";
import { applyVibrancyPass } from "./vibrancyPass.js";
import { DESIGN_LANGUAGE_PROMPT } from "./designLanguage.js";

/** Layout design is heavier than a template pick — allow a real budget. */
const DESIGN_TIMEOUT_MS = 25_000;

const AiDesignResponseSchema = z.object({
  blocks: z.array(LayoutBlockSchema).min(1),
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
  clientName: string;
  monthLabel?: string;
  previousVersion?: number;
}

export interface DesignLayoutResult {
  layout: AssembledLayout;
  mode: "ai" | "deterministic";
  designNotes?: string;
  fallbackReason?: string;
  promptAudit: {
    systemPrompt: string;
    userPrompt: string;
  };
}

function excerpt(body: string, max = 220): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length <= max
    ? clean
    : `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** Drop blocks whose content references don't exist; clamp geometry. */
function sanitizeBlocks(
  blocks: LayoutBlock[],
  input: DesignLayoutInput,
): LayoutBlock[] {
  const articleIds = new Set(input.articles.map((a) => a.id));
  const imageIds = new Set(input.images.map((i) => i.id));
  const cols = input.gridSpec.columns;
  const seenImages = new Set<string>();

  const kept = blocks.filter((b) => {
    if (b.page < 1 || b.page > input.pageCount) return false;
    if (b.articleId && !articleIds.has(b.articleId)) return false;
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
    return {
      ...b,
      position: {
        ...b.position,
        col,
        colSpan,
        row: Math.max(1, b.position.row),
        rowSpan: Math.max(1, b.position.rowSpan),
      },
    };
  });
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
  // First reuse empty/needsFiller image slots, then stack at page bottoms.
  for (const img of missing) {
    const idx = out.findIndex(
      (b) => !b.imageId && !b.articleId && (b.kind === "empty" || b.needsFiller),
    );
    if (idx !== -1) {
      out[idx] = { ...out[idx], kind: "image", imageId: img.id, needsFiller: false };
      continue;
    }
    const page = input.pageCount;
    const maxRow = Math.max(
      0,
      ...out.filter((b) => b.page === page).map((b) => b.position.row + b.position.rowSpan),
    );
    out.push({
      blockId: `reattach-${img.id}`,
      slotId: `reattach-${img.id}`,
      page,
      position: { col: 1, row: maxRow, colSpan: Math.min(8, input.gridSpec.columns), rowSpan: 3 },
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
  const deterministic = () =>
    applyVibrancyPass({
      layout: assembleLayout({
        templateId: input.templateId,
        pageCount: input.pageCount,
        gridSpec: input.gridSpec,
        articles: input.articles,
        images: input.images,
        recurringSections: input.recurringSections,
        previousVersion: input.previousVersion,
      }),
      articles: input.articles,
      images: input.images,
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
    images: input.images.map((i) => ({
      id: i.id,
      aspect: i.aspect,
      caption: i.caption ?? i.alt ?? null,
    })),
    startingBlocks: skeleton.blocks,
    respondWith:
      '{ "blocks": [ ...full AssembledLayout blocks with style/heading/caption/listItems... ], "designNotes": "one sentence" }',
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
      promptAudit: { systemPrompt, userPrompt },
    };
  }

  // Cast once: AiDesignResponseSchema is built with this file's zod instance
  // while LayoutBlockSchema comes from the shared package build — structurally
  // identical, nominally distinct under workspace hoisting.
  let blocks = sanitizeBlocks(result.data.blocks as unknown as LayoutBlock[], input);
  if (blocks.length === 0) {
    return {
      layout: fallbackLayout,
      mode: "deterministic",
      fallbackReason: "ai_returned_no_valid_blocks",
      promptAudit: { systemPrompt, userPrompt },
    };
  }
  blocks = reattachMissingImages(blocks, input);

  const layout: AssembledLayout = applyVibrancyPass({
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
  });

  return {
    layout,
    mode: "ai",
    designNotes: result.data.designNotes,
    promptAudit: { systemPrompt, userPrompt },
  };
}
