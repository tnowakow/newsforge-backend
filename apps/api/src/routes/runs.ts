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
  type NewsImage,
} from "@newsforge/shared/schemas";
import { assembleLayout } from "../services/layoutAssembly.js";
import { generateMockContent } from "../services/mockContent.js";
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
import { runComplianceSync } from "../services/complianceService.js";
import { buildBundle } from "../services/bundleExportService.js";
import { callGeminiJson } from "../gemini.js";

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

async function candidateTemplatesForClient(
  clientRichness: string,
  clientId: string,
): Promise<ScoreableTemplate[]> {
  // Trilogy → 5 Trilogy templates only (ids prefixed with "t-trilogy-" via
  // stableId hash, tagged in compatibilityHints.notes for lookup safety).
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
      const isTrilogyTemplate =
        notes.includes("[trilogy]") || t.name.startsWith("Trilogy ");
      if (isTrilogy) return isTrilogyTemplate;
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
  articles: ArticlesSchema.optional(),
  images: ImagesSchema.optional(),
});

runsRouter.post("/", async (req, res) => {
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

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
  if (!articles || !images) {
    const mock = await generateMockContent({
      richness: client.richnessLevel,
      careLevel: client.careLevel,
      brandVoice: client.brandVoice,
      clientName: client.name,
      city: client.city,
      monthLabel: body.monthLabel,
    });
    articles = articles ?? mock.articles;
    images = images ?? mock.images;
  }

  // ---- v2: auto-arrange template selection (deterministic scoring) ----
  const candidates = await candidateTemplatesForClient(
    client.richnessLevel,
    client.id,
  );
  let chosenTemplateId = body.templateId ?? client.defaultTemplateId;
  let pickResult: ReturnType<typeof pickBestTemplate> | null = null;
  if (!body.templateId && candidates.length > 0) {
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
  const recurringParsed = RecurringSectionsSchema.safeParse(
    client.recurringSections,
  );
  const recurringSections = recurringParsed.success ? recurringParsed.data : [];

  // Fit strategy — overflow/underflow trimming before assembly (Vitaly §7).
  const scoreableChosen: ScoreableTemplate = {
    id: template.id,
    pageCount: template.pageCount,
    gridSpec: template.gridSpec,
  };
  const fitResult = fitContent(articles, images, scoreableChosen);
  articles = fitResult.articles;
  images = fitResult.keptImages;

  let layout = assembleLayout({
    templateId: template.id,
    pageCount: template.pageCount,
    gridSpec: gridSpecParsed.data,
    articles,
    images,
    recurringSections,
  });

  const monthLabel =
    body.monthLabel ??
    new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  const fillerMode = body.fillerMode ?? "GENERATE";
  if (fillerMode === "GENERATE" && layout.blocks.some((b) => b.needsFiller)) {
    const filled = await generateFiller({
      layout,
      gridSpec: gridSpecParsed.data,
      recurringSections,
      articles,
      brandVoice: client.brandVoice,
      clientName: client.name,
      monthLabel,
      mode: fillerMode,
    });
    layout = filled.layout;
    articles = filled.articles;
  }

  // Build the fit report for persistence.
  const layoutFitReport = buildLayoutFitReport({
    articles,
    images,
    candidates,
    chosen: scoreableChosen,
    pickResult: pickResult ?? undefined,
    fitResult,
  });

  // Run compliance sync detectors (Vitaly rule 18 seeded on create).
  const complianceFlags = runComplianceSync({ articles, images });

  const run = await prisma.newsletterRun.create({
    data: {
      id: createId(),
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
        diffSummary: result.diff as unknown as object,
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
    .enum(["web", "print"])
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
  const finalLayout: AssembledLayout = { ...newLayout, version: bumpedVersion };
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
