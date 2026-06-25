import { Router } from "express";
import fs from "node:fs";
import { prisma } from "../db.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { NotFoundError, ValidationError } from "../util/errors.js";
import { buildRunHtml } from "../services/runHtml.js";
import { parseBody, parseJson } from "../util/validate.js";
import {
  CreateRunRequestSchema,
  NewsletterRunDtoSchema,
  EditRequestSchema,
  AiEditRequestSchema,
  AiUnlockRequestSchema,
  AssembledLayoutSchema,
  ArticleArraySchema,
  ImageRefArraySchema,
  FillerRequestSchema,
  type AssembledLayout,
  type EditOp,
} from "@newsforge/shared";
import { generateMockContent } from "../services/mockContentService.js";
import { assembleLayout } from "../services/assemblyService.js";
import { generateFiller } from "../services/fillerService.js";
import { applyAiEdit } from "../services/aiEditService.js";
import { renderRunToPdf } from "../services/pdfService.js";
import {
  aiPerHourLimiter,
  aiPerMinuteLimiter,
  unlockLimiter,
  writeLimiter,
} from "../middleware/rateLimit.js";
import {
  assertNotLockedOut,
  clearAiUnlockCookie,
  recordUnlockAttempt,
  requireAiUnlocked,
  setAiUnlockCookie,
  timingSafeEqualPassword,
} from "../middleware/aiAuth.js";

export const runsRouter = Router();

function runToDto(run: Awaited<ReturnType<typeof prisma.newsletterRun.findUnique>>) {
  if (!run) throw new NotFoundError("Run");
  return NewsletterRunDtoSchema.parse({
    id: run.id,
    clientId: run.clientId,
    templateId: run.templateId,
    monthLabel: run.monthLabel,
    fillerMode: run.fillerMode,
    status: run.status,
    errorMessage: run.errorMessage,
    pdfPath: run.pdfPath,
    pdfGeneratedAt: run.pdfGeneratedAt ? run.pdfGeneratedAt.toISOString() : null,
    layoutVersion: run.layoutVersion,
    articles: parseJson(ArticleArraySchema, run.articles),
    images: parseJson(ImageRefArraySchema, run.images),
    assembledLayout: parseJson(AssembledLayoutSchema, run.assembledLayout),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  });
}

/** POST /api/runs — create + assemble. */
runsRouter.post(
  "/",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(CreateRunRequestSchema, req.body);
    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) throw new NotFoundError("Client");
    const templateId = body.templateId ?? client.defaultTemplateId;
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) throw new NotFoundError("Template");

    const { articles, images } = await generateMockContent(client.id, body.monthLabel);

    // Create placeholder run row first so we have an id to seed assembly with.
    const created = await prisma.newsletterRun.create({
      data: {
        clientId: client.id,
        templateId: template.id,
        monthLabel: body.monthLabel,
        fillerMode: body.fillerMode,
        articles: articles as never,
        images: images as never,
        assembledLayout: { schemaVersion: 1, pages: [] } as never,
        status: "ASSEMBLING",
      },
    });

    let assembled: AssembledLayout;
    try {
      assembled = await assembleLayout({
        runIdSeed: `${client.id}::${body.monthLabel}::${created.id}`,
        templateId: template.id,
        articles,
        images,
        fillerMode: body.fillerMode,
      });
    } catch (e) {
      await prisma.newsletterRun.update({
        where: { id: created.id },
        data: { status: "ERROR", errorMessage: e instanceof Error ? e.message : String(e) },
      });
      throw e;
    }

    const final = await prisma.newsletterRun.update({
      where: { id: created.id },
      data: { assembledLayout: assembled as never, status: "READY" },
    });
    res.status(201).json({ run: runToDto(final) });
  }),
);

runsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const run = await prisma.newsletterRun.findUnique({ where: { id: req.params.id } });
    res.json({ run: runToDto(run) });
  }),
);

/** POST /api/runs/:id/filler — AI filler OR placeholder blocks. */
runsRouter.post(
  "/:id/filler",
  writeLimiter,
  asyncHandler(async (req, res) => {
    parseBody(FillerRequestSchema, req.body ?? {});
    const out = await generateFiller(req.params.id);
    res.json({
      status: out.status,
      blocksFilled: out.blocksFilled,
      layout: out.layout,
    });
  }),
);

/** POST /api/runs/:id/edit — manual block edit. */
runsRouter.post(
  "/:id/edit",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(EditRequestSchema, req.body);
    const run = await prisma.newsletterRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new NotFoundError("Run");
    const before = parseJson(AssembledLayoutSchema, run.assembledLayout);
    const after = applyManualEdits(before, body.ops);
    const updated = await prisma.newsletterRun.update({
      where: { id: req.params.id },
      data: {
        assembledLayout: after as never,
        layoutVersion: { increment: 1 },
        pdfPath: null,
        pdfGeneratedAt: null,
      },
    });
    res.json({ run: runToDto(updated) });
  }),
);

/** POST /api/runs/:id/ai-edit/unlock — password-gate (Sofia Screen 6 State A). */
runsRouter.post(
  "/:id/ai-edit/unlock",
  unlockLimiter,
  asyncHandler(async (req, res) => {
    assertNotLockedOut(req);
    const body = parseBody(AiUnlockRequestSchema, req.body);
    const ok = timingSafeEqualPassword(body.password);
    const lock = recordUnlockAttempt(req, ok);
    if (!ok) {
      if (lock.lockedUntil) {
        const retryAfter = Math.ceil((lock.lockedUntil - Date.now()) / 1000);
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({ error: "LOCKED", retryAfter });
        return;
      }
      res.status(401).json({ error: "WRONG_PASSWORD" });
      return;
    }
    setAiUnlockCookie(res);
    res.json({ unlocked: true });
  }),
);

runsRouter.post(
  "/:id/ai-edit/lock",
  asyncHandler(async (_req, res) => {
    clearAiUnlockCookie(res);
    res.json({ unlocked: false });
  }),
);

/** POST /api/runs/:id/ai-edit — call Gemini, apply, persist. */
runsRouter.post(
  "/:id/ai-edit",
  aiPerHourLimiter,
  aiPerMinuteLimiter,
  requireAiUnlocked,
  asyncHandler(async (req, res) => {
    const body = parseBody(AiEditRequestSchema, req.body);
    const run = await prisma.newsletterRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new NotFoundError("Run");
    const result = await applyAiEdit(req.params.id, body.prompt);
    res.json({
      status: result.status,
      summary: result.summary,
      diff: result.diff,
      geminiLatency: result.geminiLatency,
      aiEditId: result.aiEditId,
      layout: result.layout,
    });
  }),
);

/** GET /api/runs/:id/ai-edits — recent prompts (Sofia Screen 6 "Recent prompts"). */
runsRouter.get(
  "/:id/ai-edits",
  asyncHandler(async (req, res) => {
    const rows = await prisma.aiEdit.findMany({
      where: { runId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        prompt: true,
        resultStatus: true,
        geminiLatency: true,
        diffSummary: true,
        createdAt: true,
      },
    });
    res.json({
      edits: rows.map((r) => ({
        id: r.id,
        prompt: r.prompt,
        resultStatus: r.resultStatus,
        geminiLatency: r.geminiLatency,
        diffSummary: r.diffSummary,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }),
);

/** POST /api/runs/:id/pdf — render to PDF and stream. */
runsRouter.post(
  "/:id/pdf",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { pdfPath, ms } = await renderRunToPdf(req.params.id);
    if (!fs.existsSync(pdfPath)) throw new Error("PDF not written");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Render-Ms", String(ms));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${suggestFilename(req.params.id)}"`,
    );
    fs.createReadStream(pdfPath).pipe(res);
  }),
);

function suggestFilename(_runId: string): string {
  // Resolved synchronously to avoid a DB roundtrip here.
  return `newsforge-${_runId}.pdf`;
}

function applyManualEdits(layout: AssembledLayout, ops: EditOp[]): AssembledLayout {
  const next: AssembledLayout = JSON.parse(JSON.stringify(layout));
  for (const op of ops) {
    const page = next.pages.find((p) => p.pageNumber === op.pageNumber);
    if (!page) throw new ValidationError(`Page ${op.pageNumber} not found in layout`);
    switch (op.op) {
      case "move": {
        const b = page.blocks.find((b) => b.id === op.blockId);
        if (!b) throw new ValidationError(`Block ${op.blockId} not found on page ${op.pageNumber}`);
        b.x = clamp(op.x, 0, page.template.gridCols - 1);
        b.y = clamp(op.y, 0, page.template.gridRows - 1);
        break;
      }
      case "resize": {
        const b = page.blocks.find((b) => b.id === op.blockId);
        if (!b) throw new ValidationError(`Block ${op.blockId} not found on page ${op.pageNumber}`);
        b.w = clamp(op.w, 1, page.template.gridCols);
        b.h = clamp(op.h, 1, page.template.gridRows);
        break;
      }
      case "delete": {
        const idx = page.blocks.findIndex((b) => b.id === op.blockId);
        if (idx >= 0) page.blocks.splice(idx, 1);
        break;
      }
      case "swap-content": {
        const b = page.blocks.find((b) => b.id === op.blockId);
        if (!b) throw new ValidationError(`Block ${op.blockId} not found on page ${op.pageNumber}`);
        b.contentRef = op.contentRef;
        break;
      }
    }
  }
  return AssembledLayoutSchema.parse(next);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// PUBLIC preview-html — same HTML as Puppeteer's /render/:id, but accessible
// from the browser iframe. Auth = runId existence only (cuid2 ids are unguessable).
// The internal /render/:id route stays loopback-locked for Puppeteer.
runsRouter.get("/:id/preview-html", asyncHandler(async (req, res) => {
  const result = await buildRunHtml(req.params.id);
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
}));
