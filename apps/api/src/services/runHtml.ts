/**
 * Shared helper: load a NewsletterRun + dependencies from Prisma, validate the
 * JSON columns against Zod schemas, and render the print-ready HTML.
 *
 * Two callers:
 *   1. INTERNAL  GET /render/:runId            (Puppeteer; 127.0.0.1 + key)
 *   2. PUBLIC    GET /api/runs/:id/preview-html (iframe in SPA; runId only)
 *
 * Both routes need bit-identical HTML so the on-screen preview matches the
 * PDF that Puppeteer produces. Centralising load+validate+render keeps them in sync.
 */
import { prisma } from "../db.js";
import { renderRunHtml } from "./renderHtml.js";
import {
  AssembledLayoutSchema,
  ArticleArraySchema,
  ImageRefArraySchema,
  RecurringSectionsSchema,
} from "@newsforge/shared";

export type RunHtmlResult =
  | { ok: true; html: string }
  | { ok: false; status: 404 | 500; reason: string };

export async function buildRunHtml(runId: string): Promise<RunHtmlResult> {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    include: { client: true, template: true },
  });
  if (!run) return { ok: false, status: 404, reason: "run_not_found" };

  const layout = AssembledLayoutSchema.safeParse(run.assembledLayout);
  const articles = ArticleArraySchema.safeParse(run.articles);
  const images = ImageRefArraySchema.safeParse(run.images);
  const recurring = RecurringSectionsSchema.safeParse(run.client.recurringSections);

  if (!layout.success || !articles.success || !images.success) {
    return { ok: false, status: 500, reason: "invalid_run_state" };
  }

  const html = renderRunHtml({
    clientName: run.client.name,
    monthLabel: run.monthLabel,
    brandKit: {
      primaryColor: run.client.primaryColor,
      secondaryColor: run.client.secondaryColor,
      accentColor: run.client.accentColor,
      headingFont: run.client.headingFont,
      bodyFont: run.client.bodyFont,
      logoUrl: run.client.logoUrl,
    },
    layout: layout.data,
    articles: articles.data,
    images: images.data,
    recurringSections: recurring.success ? recurring.data : [],
  });

  return { ok: true, html };
}
