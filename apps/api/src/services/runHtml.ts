/**
 * Shared helper: load a NewsletterRun + dependencies from Prisma, validate the
 * JSON columns against Zod schemas, and render the print-ready HTML.
 *
 * Two callers:
 *   1. INTERNAL  GET /render/:runId            (Puppeteer; 127.0.0.1 + key)
 *   2. PUBLIC    GET /api/runs/:id/preview-html (iframe; runId existence only)
 *
 * Both routes need bit-identical HTML so the on-screen preview matches the
 * PDF that Puppeteer produces. Centralising the load+validate+render keeps
 * them in sync.
 */
import { prisma } from "../db.js";
import { renderRunHtml } from "./renderHtml.js";
import {
  ArticlesSchema,
  AssembledLayoutSchema,
  type AssembledLayout,
  GridSpecSchema,
  ImagesSchema,
  RecurringSectionsSchema,
  type NewsImage,
} from "@newsforge/shared/schemas";

export type RunHtmlResult =
  | { ok: true; html: string }
  | { ok: false; status: 404 | 500; reason: string };

export type RunHtmlVariant = "web" | "print" | "spread";

function svgFallbackDataUri(image: NewsImage): string {
  const label = (image.alt ?? image.caption ?? "Newsletter photo")
    .replace(/[<>&"]/g, "")
    .slice(0, 80);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#dbeafe"/><stop offset="0.45" stop-color="#fef3c7"/><stop offset="1" stop-color="#fecdd3"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="240" cy="210" r="88" fill="#ffffff" opacity="0.75"/><rect x="150" y="340" width="900" height="210" rx="36" fill="#ffffff" opacity="0.72"/><text x="600" y="455" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#334155">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function inlineRemoteImage(image: NewsImage): Promise<NewsImage> {
  if (!/^https?:\/\//i.test(image.url)) return image;
  try {
    const res = await fetch(image.url, {
      signal: AbortSignal.timeout(7_500),
      headers: { "user-agent": "NewsForgeBot/1.0" },
    });
    if (!res.ok) return { ...image, url: svgFallbackDataUri(image) };
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return { ...image, url: svgFallbackDataUri(image) };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      ...image,
      url: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  } catch {
    return { ...image, url: svgFallbackDataUri(image) };
  }
}

async function inlineRemoteImages(images: NewsImage[]): Promise<NewsImage[]> {
  return Promise.all(images.map(inlineRemoteImage));
}

function innerSpreadLayout(layout: AssembledLayout): AssembledLayout {
  if (!layout.templateId.startsWith("v3-") || layout.pageCount < 4) {
    return layout;
  }
  const blocks = layout.blocks
    .filter((block) => block.page === 2 || block.page === 3)
    .map((block) => ({ ...block, page: block.page - 1 }));
  return {
    ...layout,
    pageCount: 2,
    blocks,
    stats: {
      placedArticles: blocks.filter((block) => block.articleId).length,
      placedImages: blocks.filter((block) => block.imageId).length,
      fillerBlocks: blocks.filter((block) => block.kind === "filler" || block.needsFiller).length,
      emptySlots: blocks.filter((block) => block.kind === "empty").length,
    },
  };
}

export async function buildRunHtml(
  runId: string,
  variant: RunHtmlVariant = "web",
): Promise<RunHtmlResult> {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    include: { client: true, template: true },
  });
  if (!run) return { ok: false, status: 404, reason: "run_not_found" };

  const grid = GridSpecSchema.safeParse(run.template.gridSpec);
  const layout = AssembledLayoutSchema.safeParse(run.assembledLayout);
  const articles = ArticlesSchema.safeParse(run.articles);
  const images = ImagesSchema.safeParse(run.images);
  const recurring = RecurringSectionsSchema.safeParse(
    run.client.recurringSections,
  );

  if (!grid.success || !layout.success || !articles.success || !images.success) {
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
    gridSpec: grid.data,
    layout: variant === "spread" ? innerSpreadLayout(layout.data) : layout.data,
    articles: articles.data,
    images: await inlineRemoteImages(images.data),
    recurringSections: recurring.success ? recurring.data : [],
    variant,
  });

  return { ok: true, html };
}
