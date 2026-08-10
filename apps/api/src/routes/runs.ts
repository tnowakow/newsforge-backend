import { Router } from "express";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "../db.js";
import {
  ArticleSchema,
  ArticlesSchema,
  AssembledLayoutSchema,
  FillerModeSchema,
  GridSpecSchema,
  ImageSchema,
  ImagesSchema,
  LayoutBlockSchema,
  RecurringSectionsSchema,
  type AssembledLayout,
  type Article,
  type GridSpec,
  type NewsImage,
} from "@newsforge/shared/schemas";
import { assembleLayout } from "../services/layoutAssembly.js";
import { designLayout } from "../services/aiLayoutDesigner.js";
import { generateMockContentWithAi } from "../services/mockContent.js";
import { generateFiller } from "../services/filler.js";
import { runAiEdit } from "../services/aiEdit.js";
import {
  generatePdfForRun,
  generatePdfPair,
  invalidatePdfCache,
  type PdfVariant,
} from "../services/pdf.js";
import { buildRunHtml } from "../services/runHtml.js";
import {
  aiRateLimit,
  approvalRateLimit,
  unlockRateLimit,
} from "../middleware/aiRateLimit.js";
import {
  AI_UNLOCK_COOKIE,
  checkAiPassword,
  hasAiUnlockCookie,
  setAiUnlockedCookie,
} from "../middleware/aiUnlock.js";
import {
  buildLayoutFitReport,
  fitContent,
  pickBestTemplate,
  type ScoreableTemplate,
} from "../services/layoutFitService.js";
import { measureAdaptiveCandidates } from "../services/layoutMeasurementService.js";
import { runComplianceSync } from "../services/complianceService.js";
import { buildBundle } from "../services/bundleExportService.js";
import { callGeminiJson } from "../gemini.js";
import { selectStockPhotosForRun } from "../services/stockPhotoCatalog.js";
import { wrapV3InnerSpreadForDemo } from "../services/fullNewsletterWrapper.js";
import type { CandidateMeasurement } from "../services/adaptiveLayoutPlanner.js";

export const runsRouter: Router = Router();

// ---------------------------------------------------------------------
// Helpers shared across v2 endpoints
// ---------------------------------------------------------------------

/**
 * Re-run synchronous compliance detectors and persist to the run.
 * Callers pass fresh article/image arrays after mutations (Vitaly rule 18).
 */
async function refreshCompliance(
  runId: string,
  articles: Article[],
  images: NewsImage[],
): Promise<void> {
  const flags = runComplianceSync({ articles, images });
  await prisma.newsletterRun.update({
    where: { id: runId },
    data: { complianceFlags: flags as unknown as object },
  });
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimWords(text: string, ratio = 0.82): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const keep = Math.max(8, Math.floor(words.length * ratio));
  return words.slice(0, keep).join(" ");
}

function repairClippedBlocks(
  layout: AssembledLayout,
  articles: Article[],
  measurement: CandidateMeasurement,
): { layout: AssembledLayout; articles: Article[]; changed: boolean } {
  const clipped = new Set(measurement.clippedBlockIds ?? []);
  if (clipped.size === 0) return { layout, articles, changed: false };

  let changed = false;
  const nextArticles = articles.map((article) => ({ ...article }));
  const mutableArticlesById = new Map(nextArticles.map((article) => [article.id, article]));
  const nextBlocks = layout.blocks.map((block) => {
    if (!clipped.has(block.blockId)) return block;
    changed = true;
    if (block.listItems?.length) {
      return {
        ...block,
        listItems: block.listItems.length > 8 ? block.listItems.slice(0, 8) : block.listItems,
      };
    }
    if (block.articleId) {
      const article = mutableArticlesById.get(block.articleId);
      if (article) {
        const ratio = block.position.rowSpan <= 2 ? 0.45 : block.position.rowSpan <= 3 ? 0.58 : 0.68;
        article.body = trimWords(article.body, ratio);
        article.wordCount = wordCount(article.body);
      }
    }
    if (block.inlineText) {
      return { ...block, inlineText: trimWords(block.inlineText) };
    }
    return block;
  });

  return {
    layout: { ...layout, blocks: nextBlocks },
    articles: nextArticles,
    changed,
  };
}

function porterSpreadGridSpec(templateId: string, gridSpec: GridSpec): GridSpec {
  if (templateId !== "v3-spread-classic") return gridSpec;
  return {
    ...gridSpec,
    slots: gridSpec.slots.map((slot) => {
      const byId: Record<string, NonNullable<typeof slot.capacity>> = {
        "cl-p1-exec": { minWords: 180, maxWords: 270 },
        "cl-p1-upcoming-events": { minWords: 160, maxWords: 260 },
        "cl-p2-smile": { minWords: 300, maxWords: 430 },
        "cl-p2-feature-band": { minWords: 120, maxWords: 185 },
        "cl-p2-volunteer": { minWords: 85, maxWords: 145 },
        "cl-p2-trust-funds": { minWords: 55, maxWords: 90 },
      };
      const capacity = byId[slot.id];
      return capacity ? { ...slot, capacity: { ...(slot.capacity ?? {}), ...capacity } } : slot;
    }),
  };
}

async function candidateTemplatesForClient(
  clientRichness: string,
  clientId: string,
): Promise<ScoreableTemplate[]> {
  // Trilogy → the newer v3 inner-spread templates plus legacy Trilogy
  // templates. The demo target is pages 2/3 of the full newsletter, and those
  // are represented by the [v3-spread] templates.
  // Others → templates whose compatibilityHints.richness includes the
  // client's richnessLevel.
  const rows = await prisma.template.findMany();
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  const isTrilogy = client?.name === "Trilogy Health Services";

  return rows
    .filter((t) => {
      const hints = (t.compatibilityHints ?? {}) as {
        richness?: string[];
        notes?: string;
      };
      const notes = hints.notes ?? "";
      const isV3SpreadTemplate = notes.includes("[v3-spread]");
      if (isTrilogy) return isV3SpreadTemplate;
      const isTrilogyTemplate =
        notes.includes("[trilogy]") || t.name.startsWith("Trilogy ");
      if (isTrilogyTemplate) return false;
      return (hints.richness ?? []).includes(clientRichness);
    })
    .map((t) => ({
      id: t.id,
      pageCount: t.pageCount,
      gridSpec: t.gridSpec,
    }));
}

// ---------------------------------------------------------------------
// Existing v1 endpoints (with v2 additive hooks)
// ---------------------------------------------------------------------

const CreateRunBody = z.object({
  clientId: z.string().min(1),
  templateId: z.string().min(1).optional(),
  monthLabel: z.string().min(1).optional(),
  fillerMode: FillerModeSchema.optional(),
  password: z.string().optional(),
  articles: ArticlesSchema.optional(),
  images: ImagesSchema.optional(),
  contentGenerationAudit: z
    .object({
      kind: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
      durationMs: z.number().nonnegative().optional(),
      prompt: z.string().optional(),
      usedFallback: z.boolean().optional(),
      fallbackReason: z.string().optional(),
    })
    .optional(),
  scenario: z
    .enum([
      "community-classic",
      "panel-garden",
      "photo-festival",
      "resident-feature",
      "editorial-light",
    ])
    .optional(),
});

runsRouter.post("/", async (req, res) => {
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  const fillerMode = body.fillerMode ?? "GENERATE";

  if (fillerMode === "GENERATE" && !hasAiUnlockCookie(req)) {
    if (!body.password || !checkAiPassword(body.password)) {
      res.status(401).json({ error: "ai_locked" });
      return;
    }
    setAiUnlockedCookie(res);
  }

  const client = await prisma.client.findUnique({
    where: { id: body.clientId },
  });
  if (!client) {
    res.status(404).json({ error: "client_not_found" });
    return;
  }

  // Use supplied content, or generate mock content for this client.
  let articles = body.articles;
  let images = body.images;
  let generatedContentAudit:
    | {
        prompt: string;
        provider: string;
        model: string;
        durationMs?: number;
        usedFallback?: boolean;
        fallbackReason?: string;
      }
    | undefined = body.contentGenerationAudit
      ? {
          prompt: body.contentGenerationAudit.prompt ?? "Mock content generated in the workspace before newsletter assembly.",
          provider: body.contentGenerationAudit.provider ?? "newsforge",
          model: body.contentGenerationAudit.model ?? "deterministic-mock-content",
          durationMs: body.contentGenerationAudit.durationMs,
          usedFallback: body.contentGenerationAudit.usedFallback,
          fallbackReason: body.contentGenerationAudit.fallbackReason,
        }
      : undefined;
  if (!articles || !images) {
    const mock = await generateMockContentWithAi({
      richness: client.richnessLevel,
      careLevel: client.careLevel,
      brandVoice: client.brandVoice,
      clientName: client.name,
      city: client.city,
      monthLabel: body.monthLabel,
      scenario: body.scenario,
    });
    articles = articles ?? mock.articles;
    images = images ?? mock.images;
    generatedContentAudit = {
      prompt: mock.audit.prompt,
      provider: mock.audit.provider,
      model: mock.audit.model,
      durationMs: mock.audit.durationMs,
      usedFallback: mock.audit.usedFallback,
      fallbackReason: mock.audit.fallbackReason,
    };
  }

  // ---- v2: auto-arrange template selection (deterministic scoring) ----
  const candidates = await candidateTemplatesForClient(
    client.richnessLevel,
    client.id,
  );
  let chosenTemplateId = body.templateId ?? client.defaultTemplateId;
  let pickResult: ReturnType<typeof pickBestTemplate> | null = null;
  const preferredGatewaySpread =
    client.name === "Trilogy Health Services" && (!body.scenario || body.scenario === "community-classic")
      ? candidates.find((t) => t.id === "v3-spread-classic")
      : undefined;
  if (!body.templateId && preferredGatewaySpread) {
    chosenTemplateId = preferredGatewaySpread.id;
  } else if (!body.templateId && candidates.length > 0) {
    pickResult = pickBestTemplate(articles, images, candidates);
    if (pickResult.chosenTemplateId) {
      chosenTemplateId = pickResult.chosenTemplateId;
    }
  }

  const template = await prisma.template.findUnique({
    where: { id: chosenTemplateId },
  });
  if (!template) {
    res.status(404).json({ error: "template_not_found" });
    return;
  }

  const gridSpecParsed = GridSpecSchema.safeParse(template.gridSpec);
  if (!gridSpecParsed.success) {
    res.status(500).json({ error: "template_gridspec_invalid" });
    return;
  }
  const effectiveGridSpec = porterSpreadGridSpec(template.id, gridSpecParsed.data);
  const recurringParsed = RecurringSectionsSchema.safeParse(
    client.recurringSections,
  );
  const recurringSections = recurringParsed.success ? recurringParsed.data : [];

  // Demo-quality stock matching: uploaded photos are preserved, while mock /
  // generated placeholders get replaced or topped up from the described stock
  // catalog. The matcher ranks per image slot using article text, slot role,
  // aspect hints, and senior-living tags.
  images = selectStockPhotosForRun({
    articles,
    images,
    gridSpec: effectiveGridSpec,
  });

  // Fit strategy — overflow/underflow trimming before assembly (Vitaly §7).
  const scoreableChosen: ScoreableTemplate = {
    id: template.id,
    pageCount: template.pageCount,
    gridSpec: effectiveGridSpec,
  };
  const fitResult = fitContent(articles, images, scoreableChosen);
  articles = fitResult.articles;
  images = fitResult.keptImages;
  const innerImageSlotCount = effectiveGridSpec.slots.filter((slot) => slot.type === "image").length;
  const innerImages = template.id.startsWith("v3-")
    ? images.slice(0, innerImageSlotCount)
    : images;
  const runId = createId();
  const brandKit = {
    primaryColor: client.primaryColor,
    secondaryColor: client.secondaryColor,
    accentColor: client.accentColor,
    headingFont: client.headingFont,
    bodyFont: client.bodyFont,
    logoUrl: client.logoUrl,
  };

  // v3: the AI layout designer produces the styled layout (panels, colored
  // headers, list blocks, captions). Falls back to the deterministic fitter
  // + vibrancy pass internally, so this never throws and is always styled.
  const designed = await designLayout({
    templateId: template.id,
    pageCount: template.pageCount,
    gridSpec: effectiveGridSpec,
    articles,
    images: innerImages,
    recurringSections,
    brandVoice: client.brandVoice,
    brandKit,
    clientName: client.name,
    monthLabel: body.monthLabel,
    variationSeed: runId,
  });
  let layout = designed.layout;

  const monthLabel =
    body.monthLabel ??
    new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  let fillerPromptAudit:
    | {
        systemPrompt: string;
        userPrompt: string;
        provider: "gemini" | "openai" | "deterministic";
        model: string;
        durationMs: number;
        usedFallback?: boolean;
        fallbackReason?: string;
      }
    | undefined;
  if (fillerMode === "GENERATE" && layout.blocks.some((b) => b.needsFiller)) {
    const filled = await generateFiller({
      layout,
      gridSpec: effectiveGridSpec,
      recurringSections,
      articles,
      brandVoice: client.brandVoice,
      clientName: client.name,
      monthLabel,
      mode: fillerMode,
    });
    layout = filled.layout;
    articles = filled.articles;
    if (filled.promptAudit) {
      fillerPromptAudit = {
        ...filled.promptAudit,
        usedFallback: filled.usedFallback,
        fallbackReason: filled.fallbackReason,
      };
    }
  }

  layout = wrapV3InnerSpreadForDemo({
    layout,
    articles,
    images,
    clientName: client.name,
    monthLabel,
  });

  let adaptiveCandidatesForReport = designed.adaptiveCandidates;
  const selectedAdaptive = adaptiveCandidatesForReport?.find((candidate) => candidate.selected);
  if (selectedAdaptive) {
    try {
      const measureSelected = async () => {
        const [measurement] = await measureAdaptiveCandidates({
          clientName: client.name,
          monthLabel,
          brandKit,
          gridSpec: effectiveGridSpec,
          articles: articles as Article[],
          images,
          recurringSections,
          candidates: [{
            id: selectedAdaptive.id,
            label: selectedAdaptive.label,
            geometryVariant: selectedAdaptive.geometryVariant,
            layout,
            score: selectedAdaptive.score,
            subscores: selectedAdaptive.subscores,
            warnings: selectedAdaptive.warnings,
          }],
        });
        return measurement;
      };

      let finalMeasurement = await measureSelected();
      for (let attempt = 0; attempt < 5 && finalMeasurement?.clippedBlocks > 0; attempt++) {
        const repaired = repairClippedBlocks(layout, articles, finalMeasurement);
        if (!repaired.changed) break;
        layout = repaired.layout;
        articles = repaired.articles;
        finalMeasurement = await measureSelected();
      }

      if (finalMeasurement) {
        const totalBlocks = Math.max(layout.blocks.length, 1);
        const totalImages = Math.max(finalMeasurement.totalImages, 1);
        const renderFit = Math.max(
          0,
          1 -
            finalMeasurement.clippedBlocks / totalBlocks -
            finalMeasurement.overflowBlocks / totalBlocks -
            finalMeasurement.missingImages / totalImages,
        );
        adaptiveCandidatesForReport = adaptiveCandidatesForReport?.map((candidate) => {
          if (candidate.id !== selectedAdaptive.id) return candidate;
          const baseWarnings = candidate.warnings.filter(
            (warning) =>
              !/^render-(clipped|overflow|missing)-/.test(warning) &&
              !/^low-utility-blocks:/.test(warning),
          );
          return {
            ...candidate,
            measurement: finalMeasurement,
            subscores: {
              ...candidate.subscores,
              renderFit,
              usefulOccupancy: finalMeasurement.usefulOccupancy,
              geometricCoverage: finalMeasurement.geometricCoverage,
            },
            warnings: [
              ...baseWarnings,
              ...(finalMeasurement.clippedBlocks > 0
                ? [`render-clipped-blocks:${finalMeasurement.clippedBlocks}`]
                : []),
              ...(finalMeasurement.overflowBlocks > 0
                ? [`render-overflow-blocks:${finalMeasurement.overflowBlocks}`]
                : []),
              ...(finalMeasurement.missingImages > 0
                ? [`render-missing-images:${finalMeasurement.missingImages}`]
                : []),
              ...(finalMeasurement.lowUtilityBlocks > 0
                ? [`low-utility-blocks:${finalMeasurement.lowUtilityBlocks}`]
                : []),
            ],
          };
        });
      }
    } catch (err) {
      console.warn("[layout-measurement] final selected measurement skipped:", err);
    }
  }

  // Build the fit report for persistence.
  const layoutFitReport = buildLayoutFitReport({
    articles,
    images,
    candidates,
    chosen: scoreableChosen,
    pickResult: pickResult ?? undefined,
    fitResult,
    design: {
      mode: designed.mode,
      designNotes: designed.designNotes,
      fallbackReason: designed.fallbackReason,
      editorialPlan: designed.editorialPlan,
      adaptiveCandidates: adaptiveCandidatesForReport,
    },
  });

  // Run compliance sync detectors (Vitaly rule 18 seeded on create).
  const complianceFlags = runComplianceSync({ articles, images });

  const run = await prisma.newsletterRun.create({
    data: {
      id: runId,
      clientId: client.id,
      templateId: template.id,
      monthLabel,
      fillerMode,
      articles: articles as unknown as object,
      images: images as unknown as object,
      assembledLayout: layout as unknown as object,
      status: "READY",
      layoutVersion: layout.version,
      layoutFitReport: layoutFitReport as unknown as object,
      complianceFlags: complianceFlags as unknown as object,
    },
  });

  await prisma.aiEdit.create({
    data: {
      id: createId(),
      runId: run.id,
      prompt: [
        "[V3 layout design system prompt]",
        designed.promptAudit.systemPrompt,
        "",
        "[V3 layout design user prompt]",
        designed.promptAudit.userPrompt,
      ].join("\n"),
      resultStatus:
        designed.mode === "ai" ? "generation-ai" : "generation-fallback",
      diffSummary: {
        kind: "generation-design",
        mode: designed.mode,
        designNotes: designed.designNotes,
        fallbackReason: designed.fallbackReason,
        provider: designed.promptAudit.provider,
        model: designed.promptAudit.model,
        durationMs: designed.promptAudit.durationMs,
        templateId: template.id,
      } as unknown as object,
      layoutBefore: layout as unknown as object,
      layoutAfter: layout as unknown as object,
    },
  });

  const containsMockContent =
    articles.some((article) => article.source === "MOCK") ||
    images.some((image) => image.source === "MOCK");
  if (generatedContentAudit || containsMockContent) {
    await prisma.aiEdit.create({
      data: {
        id: createId(),
        runId: run.id,
        prompt:
          generatedContentAudit?.prompt ??
          "Mock content generated in the workspace before newsletter assembly.",
        resultStatus: "generation-content",
        diffSummary: {
          kind: "generation-content",
          provider: generatedContentAudit?.provider ?? "newsforge",
          model: generatedContentAudit?.model ?? "deterministic-mock-content",
          durationMs: generatedContentAudit?.durationMs,
          usedFallback: generatedContentAudit?.usedFallback ?? false,
          fallbackReason: generatedContentAudit?.fallbackReason,
          articles: articles.length,
          images: images.length,
        } as unknown as object,
        layoutBefore: layout as unknown as object,
        layoutAfter: layout as unknown as object,
      },
    });
  }

  if (fillerPromptAudit) {
    await prisma.aiEdit.create({
      data: {
        id: createId(),
        runId: run.id,
        prompt: [
          "[AI filler system prompt]",
          fillerPromptAudit.systemPrompt,
          "",
          "[AI filler user prompt]",
          fillerPromptAudit.userPrompt,
        ].join("\n"),
        resultStatus: fillerPromptAudit.usedFallback
          ? "generation-filler-fallback"
          : "generation-filler-ai",
        diffSummary: {
          kind: "generation-filler",
          usedFallback: fillerPromptAudit.usedFallback ?? false,
          fallbackReason: fillerPromptAudit.fallbackReason,
          provider: fillerPromptAudit.provider,
          model: fillerPromptAudit.model,
          durationMs: fillerPromptAudit.durationMs,
        } as unknown as object,
        layoutBefore: layout as unknown as object,
        layoutAfter: layout as unknown as object,
      },
    });
  }

  res.status(201).json({ run });
});

// ---- v2: list runs (used by Maya's Approved tab) ----
runsRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const where: { approvalStatus?: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" } =
    {};
  if (status === "approved") where.approvalStatus = "APPROVED";
  else if (status === "pending") where.approvalStatus = "PENDING";
  else if (status === "changes_requested")
    where.approvalStatus = "CHANGES_REQUESTED";

  const [runs, total] = await Promise.all([
    prisma.newsletterRun.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: { client: true, template: true },
    }),
    prisma.newsletterRun.count({ where }),
  ]);
  res.json({ runs, total, limit, offset });
});

// ---- Unlock status (site-wide gate check) ----
// Registered before GET /:id so "unlock-status" isn't swallowed as a run id.
// The unlock cookie is httpOnly so the frontend can't read it directly; this
// endpoint lets the SPA ask "am I unlocked?" on load. Same password and same
// cookie as the AI unlock gate — one password, one session.
runsRouter.get("/unlock-status", (req, res) => {
  res.json({ unlocked: hasAiUnlockCookie(req) });
});

runsRouter.get("/:id/ai-edits", async (req, res) => {
  const runId = String(req.params.id);
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    select: { id: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  const edits = await prisma.aiEdit.findMany({
    where: { runId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      prompt: true,
      resultStatus: true,
      diffSummary: true,
      createdAt: true,
    },
  });

  res.json({ edits });
});

runsRouter.get("/:id", async (req, res) => {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true, template: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }
  res.json({ run });
});

runsRouter.delete("/:id", async (req, res) => {
  const runId = String(req.params.id);
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    select: { id: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  await invalidatePdfCache(runId);
  await prisma.$transaction([
    prisma.aiEdit.deleteMany({ where: { runId } }),
    prisma.newsletterRun.delete({ where: { id: runId } }),
  ]);

  res.json({ deleted: true, runId });
});

// ---- Filler ----
runsRouter.post("/:id/filler", aiRateLimit, async (req, res) => {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true, template: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  const gridSpec = GridSpecSchema.safeParse(run.template.gridSpec);
  const layout = AssembledLayoutSchema.safeParse(run.assembledLayout);
  const articles = ArticlesSchema.safeParse(run.articles);
  const images = ImagesSchema.safeParse(run.images);
  const recurring = RecurringSectionsSchema.safeParse(
    run.client.recurringSections,
  );
  if (!gridSpec.success || !layout.success || !articles.success) {
    res.status(500).json({ error: "run_state_invalid" });
    return;
  }

  const out = await generateFiller({
    layout: layout.data,
    gridSpec: gridSpec.data,
    recurringSections: recurring.success ? recurring.data : [],
    articles: articles.data,
    brandVoice: run.client.brandVoice,
    clientName: run.client.name,
    monthLabel: run.monthLabel,
    mode: run.fillerMode,
  });

  const newVersion = run.layoutVersion + 1;
  const newLayout: AssembledLayout = { ...out.layout, version: newVersion };

  const updated = await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      articles: out.articles as unknown as object,
      assembledLayout: newLayout as unknown as object,
      layoutVersion: newVersion,
    },
  });

  // v2 rule 18: re-run compliance + rule 6/15: invalidate PDFs.
  await refreshCompliance(
    run.id,
    out.articles,
    images.success ? images.data : [],
  );
  await invalidatePdfCache(run.id);

  res.json({
    run: updated,
    usedFallback: out.usedFallback ?? false,
    fallbackReason: out.fallbackReason,
  });
});

// ---- Manual edit ----
const ManualEditBody = z.object({
  blockId: z.string().min(1),
  action: z.enum(["move", "resize", "swap"]),
  payload: z.union([
    z.object({
      action: z.literal("move").optional(),
      col: z.number().int().min(1).max(12).optional(),
      row: z.number().int().min(1).optional(),
      page: z.number().int().min(1).optional(),
    }),
    z.object({
      colSpan: z.number().int().min(1).max(12).optional(),
      rowSpan: z.number().int().min(1).optional(),
    }),
    z.object({
      swapWithBlockId: z.string().min(1).optional(),
      newArticleId: z.string().optional(),
      newImageId: z.string().optional(),
    }),
  ]),
});

runsRouter.post("/:id/edit", async (req, res) => {
  const parsed = ManualEditBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { blockId, action, payload } = parsed.data;

  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  const layoutParsed = AssembledLayoutSchema.safeParse(run.assembledLayout);
  if (!layoutParsed.success) {
    res.status(500).json({ error: "layout_invalid" });
    return;
  }
  const layout = layoutParsed.data;
  const blocks = [...layout.blocks];
  const idx = blocks.findIndex((b) => b.blockId === blockId);
  if (idx === -1) {
    res.status(404).json({ error: "block_not_found" });
    return;
  }
  const block = blocks[idx];

  if (action === "move") {
    const p = payload as { col?: number; row?: number; page?: number };
    blocks[idx] = {
      ...block,
      page: p.page ?? block.page,
      position: {
        ...block.position,
        col: p.col ?? block.position.col,
        row: p.row ?? block.position.row,
      },
    };
  } else if (action === "resize") {
    const p = payload as { colSpan?: number; rowSpan?: number };
    blocks[idx] = {
      ...block,
      position: {
        ...block.position,
        colSpan: p.colSpan ?? block.position.colSpan,
        rowSpan: p.rowSpan ?? block.position.rowSpan,
      },
    };
  } else if (action === "swap") {
    const p = payload as {
      swapWithBlockId?: string;
      newArticleId?: string;
      newImageId?: string;
    };
    if (p.swapWithBlockId) {
      const j = blocks.findIndex((b) => b.blockId === p.swapWithBlockId);
      if (j !== -1) {
        const other = blocks[j];
        blocks[idx] = {
          ...block,
          articleId: other.articleId,
          imageId: other.imageId,
          inlineText: other.inlineText,
          kind: other.kind,
        };
        blocks[j] = {
          ...other,
          articleId: block.articleId,
          imageId: block.imageId,
          inlineText: block.inlineText,
          kind: block.kind,
        };
      }
    } else {
      blocks[idx] = {
        ...block,
        articleId: p.newArticleId ?? block.articleId,
        imageId: p.newImageId ?? block.imageId,
      };
    }
  }

  const newVersion = run.layoutVersion + 1;
  const newLayout: AssembledLayout = {
    ...layout,
    blocks,
    version: newVersion,
  };

  const updated = await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      assembledLayout: newLayout as unknown as object,
      layoutVersion: newVersion,
    },
  });

  // v2 rule 18 + rule 6/15
  const articlesParsed = ArticlesSchema.safeParse(run.articles);
  const imagesParsed = ImagesSchema.safeParse(run.images);
  await refreshCompliance(
    run.id,
    articlesParsed.success ? articlesParsed.data : [],
    imagesParsed.success ? imagesParsed.data : [],
  );
  await invalidatePdfCache(run.id);

  res.json({ run: updated });
});

// ---- Full editor document save ----
const EditorDocumentBody = z.object({
  layout: AssembledLayoutSchema,
  articles: ArticlesSchema,
  images: ImagesSchema,
});

runsRouter.put("/:id/document", async (req, res) => {
  const parsed = EditorDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }

  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  const newVersion = run.layoutVersion + 1;
  const newLayout: AssembledLayout = {
    ...parsed.data.layout,
    version: newVersion,
    stats: {
      placedArticles: parsed.data.layout.blocks.filter((b) => b.articleId).length,
      placedImages: parsed.data.layout.blocks.filter((b) => b.imageId).length,
      fillerBlocks: parsed.data.layout.blocks.filter((b) => b.kind === "filler").length,
      emptySlots: parsed.data.layout.blocks.filter(
        (b) => b.kind === "empty" || b.kind === "placeholder",
      ).length,
    },
  };

  const updated = await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      articles: parsed.data.articles as unknown as object,
      images: parsed.data.images as unknown as object,
      assembledLayout: newLayout as unknown as object,
      layoutVersion: newVersion,
    },
  });

  await refreshCompliance(run.id, parsed.data.articles, parsed.data.images);
  await invalidatePdfCache(run.id);

  res.json({ run: updated });
});

// ---- Public preview HTML ----
runsRouter.get("/:id/preview-html", async (req, res) => {
  const result = await buildRunHtml(String(req.params.id));
  if (!result.ok) {
    res.status(result.status).json({ error: result.reason });
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.send(result.html);
});

// ---- Unlock AI ----
const UnlockBody = z.object({ password: z.string() });
runsRouter.post("/unlock", unlockRateLimit, (req, res) => {
  const parsed = UnlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (!checkAiPassword(parsed.data.password)) {
    res.status(401).json({ error: "invalid_password" });
    return;
  }
  setAiUnlockedCookie(res);
  res.json({ unlocked: true });
});


// ---- AI Edit ----
const AiEditBody = z.object({
  prompt: z.string().min(3).max(2000),
  password: z.string().optional(),
});

runsRouter.post("/:id/ai-edit", aiRateLimit, async (req, res) => {
  const parsed = AiEditBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { prompt, password } = parsed.data;

  if (!hasAiUnlockCookie(req)) {
    if (!password || !checkAiPassword(password)) {
      res.status(401).json({ error: "ai_locked" });
      return;
    }
    setAiUnlockedCookie(res);
  }

  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  const layoutParsed = AssembledLayoutSchema.safeParse(run.assembledLayout);
  if (!layoutParsed.success) {
    res.status(500).json({ error: "layout_invalid" });
    return;
  }

  const before = layoutParsed.data;
  const result = await runAiEdit({
    layout: before,
    prompt,
    brandVoice: run.client.brandVoice,
    clientName: run.client.name,
    monthLabel: run.monthLabel,
  });

  const newVersion = run.layoutVersion + 1;
  const newLayout: AssembledLayout = {
    ...result.layout,
    version: newVersion,
  };

  const [updated, edit] = await prisma.$transaction([
    prisma.newsletterRun.update({
      where: { id: run.id },
      data: {
        assembledLayout: newLayout as unknown as object,
        layoutVersion: newVersion,
      },
    }),
    prisma.aiEdit.create({
      data: {
        id: createId(),
        runId: run.id,
        prompt,
        resultStatus: result.status,
        diffSummary: {
          ...result.diff,
          kind: "edit",
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs,
          fallbackReason: result.reason,
        } as unknown as object,
        layoutBefore: before as unknown as object,
        layoutAfter:
          result.status === "applied"
            ? (newLayout as unknown as object)
            : undefined,
      },
    }),
  ]);

  // v2 rule 18 + rule 6/15
  const articlesParsed = ArticlesSchema.safeParse(run.articles);
  const imagesParsed = ImagesSchema.safeParse(run.images);
  await refreshCompliance(
    run.id,
    articlesParsed.success ? articlesParsed.data : [],
    imagesParsed.success ? imagesParsed.data : [],
  );
  await invalidatePdfCache(run.id);

  res.json({
    run: updated,
    edit,
    status: result.status,
    reason: result.reason,
    diff: result.diff,
  });
});

// ---- PDF (extended with ?variant=web|print, default web) ----
runsRouter.post("/:id/pdf", async (req, res) => {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  const variantParsed = z
    .enum(["web", "print", "spread"])
    .default("web")
    .safeParse(req.query.variant ?? req.body?.variant ?? "web");
  const variant: PdfVariant = variantParsed.success ? variantParsed.data : "web";

  try {
    const { pdfPath, pdfUrl } = await generatePdfForRun(run.id, variant);
    await prisma.newsletterRun.update({
      where: { id: run.id },
      data:
        variant === "print"
          ? { printPdfPath: pdfPath, printPdfGeneratedAt: new Date() }
          : { pdfPath, pdfGeneratedAt: new Date() },
    });
    res.json({ pdfUrl, pdfPath, variant });
  } catch (err) {
    console.error("[pdf] generation failed", err);
    res.status(500).json({ error: "pdf_generation_failed" });
  }
});

// ---------------------------------------------------------------------
// v2 NEW ENDPOINTS
// ---------------------------------------------------------------------

// ---- AI Arrange (password-gated) ----
const AiArrangeBody = z.object({
  prompt: z.string().min(3).max(2000).optional(),
  password: z.string().optional(),
});

const GeminiArrangeResponseSchema = z.object({
  chosenTemplateId: z.string(),
  reason: z.string().optional(),
});

runsRouter.post("/:id/ai-arrange", aiRateLimit, async (req, res) => {
  const parsed = AiArrangeBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { prompt, password } = parsed.data;

  if (!hasAiUnlockCookie(req)) {
    if (!password || !checkAiPassword(password)) {
      res.status(401).json({ error: "ai_locked" });
      return;
    }
    setAiUnlockedCookie(res);
  }

  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
    include: { client: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }
  const articlesParsed = ArticlesSchema.safeParse(run.articles);
  const imagesParsed = ImagesSchema.safeParse(run.images);
  if (!articlesParsed.success || !imagesParsed.success) {
    res.status(500).json({ error: "run_state_invalid" });
    return;
  }
  const articles = articlesParsed.data;
  const images = imagesParsed.data;

  const candidates = await candidateTemplatesForClient(
    run.client.richnessLevel,
    run.client.id,
  );
  if (candidates.length === 0) {
    res.status(500).json({ error: "no_candidate_templates" });
    return;
  }
  const deterministicPick = pickBestTemplate(articles, images, candidates);

  // Rule 14: always have deterministic fallback wired.
  const fallback = {
    chosenTemplateId: deterministicPick.chosenTemplateId,
    reason: "deterministic fallback (no Gemini)",
  };

  const geminiResult = await callGeminiJson({
    schema: GeminiArrangeResponseSchema,
    systemPrompt:
      "You are an editorial layout picker for a senior-living newsletter. " +
      "Given a run's articles/images and a list of candidate template ids, " +
      'pick the best-fitting one and respond as JSON: { "chosenTemplateId": "<id>", "reason": "<why>" }. ' +
      "chosenTemplateId MUST be one of the provided candidate ids.",
    userPrompt: JSON.stringify({
      instruction: prompt ?? "Pick the best template for this content.",
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        wordCount: a.wordCount,
        articleType: a.articleType,
      })),
      imageCount: images.length,
      candidates: candidates.map((c) => ({
        id: c.id,
        pageCount: c.pageCount,
      })),
    }),
    fallback,
  });

  const candidateIds = new Set(candidates.map((c) => c.id));
  let chosenBy: "ai" | "deterministic-fallback" = "ai";
  let chosenId = geminiResult.data.chosenTemplateId;
  let reason = geminiResult.data.reason ?? "";

  if (
    ("usedFallback" in geminiResult && geminiResult.usedFallback) ||
    !candidateIds.has(chosenId)
  ) {
    chosenBy = "deterministic-fallback";
    chosenId = deterministicPick.chosenTemplateId;
    reason =
      "Gemini unavailable or returned unknown template id — using deterministic winner";
  }

  const chosenTemplate = await prisma.template.findUnique({
    where: { id: chosenId },
  });
  if (!chosenTemplate) {
    res.status(500).json({ error: "chosen_template_missing" });
    return;
  }
  const gridSpecParsed = GridSpecSchema.safeParse(chosenTemplate.gridSpec);
  if (!gridSpecParsed.success) {
    res.status(500).json({ error: "template_gridspec_invalid" });
    return;
  }
  const recurringParsed = RecurringSectionsSchema.safeParse(
    run.client.recurringSections,
  );
  const recurring = recurringParsed.success ? recurringParsed.data : [];

  const scoreableChosen: ScoreableTemplate = {
    id: chosenTemplate.id,
    pageCount: chosenTemplate.pageCount,
    gridSpec: chosenTemplate.gridSpec,
  };
  const fitResult = fitContent(articles, images, scoreableChosen);
  const newLayout = assembleLayout({
    templateId: chosenTemplate.id,
    pageCount: chosenTemplate.pageCount,
    gridSpec: gridSpecParsed.data,
    articles: fitResult.articles,
    images: fitResult.keptImages,
    recurringSections: recurring,
  });
  const bumpedVersion = run.layoutVersion + 1;
  const finalLayout: AssembledLayout = {
    ...wrapV3InnerSpreadForDemo({
      layout: newLayout,
      articles: fitResult.articles,
      images: fitResult.keptImages,
      clientName: run.client.name,
      monthLabel: run.monthLabel,
    }),
    version: bumpedVersion,
  };
  const layoutFitReport = buildLayoutFitReport({
    articles: fitResult.articles,
    images: fitResult.keptImages,
    candidates,
    chosen: scoreableChosen,
    pickResult: deterministicPick,
    fitResult,
  });

  const updated = await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      templateId: chosenTemplate.id,
      articles: fitResult.articles as unknown as object,
      images: fitResult.keptImages as unknown as object,
      assembledLayout: finalLayout as unknown as object,
      layoutVersion: bumpedVersion,
      layoutFitReport: layoutFitReport as unknown as object,
    },
  });

  await refreshCompliance(run.id, fitResult.articles, fitResult.keptImages);
  await invalidatePdfCache(run.id);

  res.json({
    run: updated,
    chosenTemplateId: chosenTemplate.id,
    chosenBy,
    reason,
  });
});

// ---- Approve (no password) ----
const ApproveBody = z.object({
  approvedBy: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
});

runsRouter.post("/:id/approve", approvalRateLimit, async (req, res) => {
  const parsed = ApproveBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }

  // Idempotent by (runId, layoutVersion): if already approved at this
  // version AND all three artifacts exist, return cached URLs.
  const alreadyApprovedAtVersion =
    run.approvalStatus === "APPROVED" &&
    run.bundleLayoutVersion === run.layoutVersion &&
    run.pdfPath &&
    run.printPdfPath &&
    run.bundleZipPath;

  if (alreadyApprovedAtVersion) {
    const bundle = await buildBundle(run.id); // cache-hit path, refreshes signed URL
    if ("error" in bundle) {
      res.status(bundle.status).json({ error: bundle.error });
      return;
    }
    res.json({
      run,
      pdfWebUrl: pdfPathToUrl(run.pdfPath),
      pdfPrintUrl: pdfPathToUrl(run.printPdfPath),
      bundleUrl: bundle.bundleUrl,
    });
    return;
  }

  await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
      approvedBy: parsed.data.approvedBy ?? null,
      approvalNotes: parsed.data.notes ?? null,
    },
  });

  let pdfWebUrl: string | null = null;
  let pdfPrintUrl: string | null = null;
  let bundleUrl: string | null = null;
  const errors: string[] = [];

  try {
    const pair = await generatePdfPair(run.id);
    pdfWebUrl = pair.web.pdfUrl;
    pdfPrintUrl = pair.print.pdfUrl;
  } catch (err) {
    console.error("[approve] pdf pair failed", err);
    errors.push("pdf_generation_failed");
  }

  try {
    const bundle = await buildBundle(run.id, { regenerate: true });
    if ("error" in bundle) errors.push(bundle.error);
    else bundleUrl = bundle.bundleUrl;
  } catch (err) {
    console.error("[approve] bundle build failed", err);
    errors.push("bundle_build_failed");
  }

  const updated = await prisma.newsletterRun.findUnique({
    where: { id: run.id },
  });

  res.json({
    run: updated,
    pdfWebUrl,
    pdfPrintUrl,
    bundleUrl,
    errors: errors.length ? errors : undefined,
  });
});

function pdfPathToUrl(pdfPath: string | null): string | null {
  if (!pdfPath) return null;
  const filename = pdfPath.split(/[\\/]/).pop();
  return filename
    ? `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? ""}/pdfs/${filename}`
    : null;
}

// ---- Request changes (no password) ----
const RequestChangesBody = z.object({
  notes: z.string().min(1).max(2000),
  requestedBy: z.string().min(1).max(200).optional(),
});

runsRouter.post("/:id/request-changes", approvalRateLimit, async (req, res) => {
  const parsed = RequestChangesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }
  const updated = await prisma.newsletterRun.update({
    where: { id: run.id },
    data: {
      approvalStatus: "CHANGES_REQUESTED",
      approvalNotes: parsed.data.notes,
      approvedBy: parsed.data.requestedBy ?? null,
    },
  });
  res.json({ run: updated });
});

// ---- InDesign bundle export ----
const BundleExportBody = z.object({
  regenerate: z.boolean().default(false).optional(),
});

runsRouter.post("/:id/export/indesign-bundle", async (req, res) => {
  const parsed = BundleExportBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const result = await buildBundle(String(req.params.id), {
    regenerate: parsed.data.regenerate ?? false,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({
    bundleUrl: result.bundleUrl,
    sizeBytes: result.sizeBytes,
    layoutVersion: result.layoutVersion,
    builtAt: result.builtAt.toISOString(),
  });
});

// Suppress unused warning for the cookie name constant.
void AI_UNLOCK_COOKIE;
void LayoutBlockSchema;
void ArticleSchema;
void ImageSchema;
