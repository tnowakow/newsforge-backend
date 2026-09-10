import type { Article, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import { getPage } from "../browser.js";
import { articleImageMatchesRef } from "./porterSourceSemantics.js";

export type StoryModuleKind =
  | "director"
  | "story-image"
  | "story-image-pair"
  | "long-text-columns"
  | "compact-list"
  | "tall-list-rail";

export interface StoryModuleInput {
  kind: StoryModuleKind;
  article?: Article;
  images?: NewsImage[];
  widthPx: number;
  /** CSS style version; changing it invalidates the run-local cache. */
  styleVersion: string;
  fontVersion: string;
  headingFont?: string;
  bodyFont?: string;
  minHeightPx?: number;
  columns?: number;
}

export interface StoryModuleMeasurement {
  kind: StoryModuleKind;
  widthPx: number;
  intrinsicHeightPx: number;
  minHeightPx: number;
  imageAreaPx: number;
  contentHeightPx: number;
  clipped: boolean;
  missingImages: string[];
  missingFonts: string[];
  sourceArticleId?: string;
  sourceImageIds: string[];
  cacheKey: string;
}

const runCache = new Map<string, StoryModuleMeasurement>();

function stableKey(input: StoryModuleInput): string {
  const article = input.article
    ? { id: input.article.id, title: input.article.title, body: input.article.body, byline: input.article.byline, rows: input.article.wordCount }
    : null;
  const images = (input.images ?? []).map((image) => ({
    id: image.id,
    url: image.url,
    caption: image.caption,
    width: image.width,
    height: image.height,
    focalX: image.focalX,
    focalY: image.focalY,
    fitMode: image.fitMode,
  }));
  return JSON.stringify({ kind: input.kind, widthPx: input.widthPx, styleVersion: input.styleVersion, fontVersion: input.fontVersion, headingFont: input.headingFont, bodyFont: input.bodyFont, minHeightPx: input.minHeightPx, columns: input.columns, article, images });
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function imageMarkup(image: NewsImage): string {
  const focalX = image.focalX ?? 50;
  const focalY = image.focalY ?? 50;
  // "fill" is deliberately not emitted: it distorts source photos.
  const fit = image.fitMode === "contain" ? "contain" : "cover";
  return `<figure class="module-photo"><img src="${esc(image.url)}" alt="${esc(image.alt ?? "")}" data-image-id="${esc(image.id)}" style="object-fit:${fit};object-position:${focalX}% ${focalY}%"/>${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}</figure>`;
}

function articleMarkup(input: StoryModuleInput): string {
  const article = input.article;
  if (!article) return "";
  const body = article.body.split(/\n{1,2}/).map((part) => part.trim()).filter(Boolean).map((part) => `<p>${esc(part)}</p>`).join("");
  const rows = article.body.split(/\n+|;\s*/).map((row) => row.trim()).filter(Boolean).map((row) => `<div class="module-row">${esc(row)}</div>`).join("");
  const list = input.kind === "compact-list" || input.kind === "tall-list-rail";
  const columns = input.kind === "long-text-columns" ? Math.max(2, input.columns ?? 2) : 1;
  return `<article class="module-copy ${list ? "module-list" : ""}" style="column-count:${columns}"><h2>${esc(article.title)}</h2>${article.byline ? `<div class="module-byline">${esc(article.byline)}</div>` : ""}<div class="module-body">${list ? rows : body}</div></article>`;
}

function moduleMarkup(input: StoryModuleInput): string {
  const images = input.images ?? [];
  const imageHtml = images.map(imageMarkup).join("");
  return `<main class="story-module module-${input.kind}">${articleMarkup(input)}<div class="module-images">${imageHtml}</div></main>`;
}

/** Clear measurements between independent runs. Cache is intentionally never persisted. */
export function clearStoryModuleMeasurementCache(): void {
  runCache.clear();
}

/**
 * Measure one complete source module in Chromium. Failure is explicit: missing
 * source images or required fonts throw instead of being converted to zero.
 */
export async function measureStoryModule(input: StoryModuleInput): Promise<StoryModuleMeasurement> {
  if (!Number.isFinite(input.widthPx) || input.widthPx <= 0) throw new Error("story module width must be positive");
  const cacheKey = stableKey(input);
  const cached = runCache.get(cacheKey);
  if (cached) return { ...cached, sourceImageIds: [...cached.sourceImageIds] };
  const page = await getPage();
  const headingFont = input.headingFont ?? "Georgia";
  const bodyFont = input.bodyFont ?? "Georgia";
  const images = input.images ?? [];
  await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{width:${input.widthPx}px;font-family:${bodyFont},serif}.story-module{width:100%;display:flex;gap:12px;padding:10px;border:1px solid #bbb}.module-copy{min-width:0;flex:1;font-family:${bodyFont},serif}.module-copy h2{font-family:${headingFont},serif;font-size:18px;line-height:1.05;margin:0 0 6px}.module-body{font-size:14px;line-height:1.25}.module-body p{margin:0 0 6px}.module-byline{font-size:11px;margin-bottom:4px}.module-images{display:flex;gap:8px;min-width:0;flex:1}.module-photo{margin:0;min-width:0;flex:1;display:flex;flex-direction:column}.module-photo img{width:100%;height:120px;display:block}.module-photo figcaption{font-size:11px;line-height:1.1}.module-list .module-body{font-size:13px}.module-row{padding:2px 0;border-bottom:1px dotted #bbb}.module-long-text-columns .module-copy{column-gap:12px}</style></head><body>${moduleMarkup(input)}</body></html>`, { waitUntil: "domcontentloaded", timeout: 8_000 });
  const result = await page.evaluate(({ requiredHeading, requiredBody, minHeight }) => {
    const doc = (globalThis as any).document;
    const fonts = [requiredHeading, requiredBody].filter((font, index, list) => list.indexOf(font) === index);
    const missingFonts = fonts.filter((font) => !doc.fonts.check(`16px "${font}"`));
    const imageNodes = Array.from(doc.querySelectorAll(".module-photo img")) as any[];
    const missingImages = imageNodes.filter((image) => !image.complete || image.naturalWidth <= 0).map((image) => image.dataset.imageId ?? "unknown");
    const module = doc.querySelector(".story-module") as any;
    if (!module) throw new Error("story module did not render");
    const rect = module.getBoundingClientRect();
    const copy = doc.querySelector(".module-copy") as any;
    const imageAreaPx = imageNodes.reduce((area, image) => { const r = image.getBoundingClientRect(); return area + r.width * r.height; }, 0);
    const clipped = Boolean(copy && (copy.scrollHeight > copy.clientHeight + 1 || copy.scrollWidth > copy.clientWidth + 1));
    return { intrinsicHeightPx: Math.ceil(rect.height), contentHeightPx: Math.ceil(copy?.scrollHeight ?? 0), imageAreaPx: Math.ceil(imageAreaPx), missingImages, missingFonts, clipped: clipped || rect.height < minHeight };
  }, { requiredHeading: headingFont, requiredBody: bodyFont, minHeight: input.minHeightPx ?? 0 });
  if (result.missingImages.length > 0) throw new Error(`story module missing images: ${result.missingImages.join(", ")}`);
  if (result.missingFonts.length > 0) throw new Error(`story module missing fonts: ${result.missingFonts.join(", ")}`);
  const measurement: StoryModuleMeasurement = { ...result, kind: input.kind, widthPx: input.widthPx, minHeightPx: input.minHeightPx ?? result.intrinsicHeightPx, sourceArticleId: input.article?.id, sourceImageIds: images.map((image) => image.id), cacheKey };
  runCache.set(cacheKey, measurement);
  return { ...measurement, sourceImageIds: [...measurement.sourceImageIds] };
}

export async function measureStoryModules(inputs: StoryModuleInput[]): Promise<StoryModuleMeasurement[]> {
  const results: StoryModuleMeasurement[] = [];
  for (const input of inputs) results.push(await measureStoryModule(input));
  return results;
}

/** Validate that a planned compound retains all required source children. */
export function validateStoryCompound(blocks: LayoutBlock[], article: Article, images: NewsImage[]): void {
  // The planner stamps every member of a story's compound with
  // `compound-${article.id}` (see porterCompoundPlanner / adaptiveLayoutPlanner).
  // `article.compoundId` is optional and frequently absent, so comparing it
  // directly against `block.compoundId` silently degrades to
  // `undefined === undefined` and matches unpaired outer photos instead of
  // the story's own images. Resolve the canonical key explicitly.
  const compoundKey = article.compoundId ?? `compound-${article.id}`;
  const articleBlocks = blocks.filter((block) => block.articleId === article.id || block.compoundId === compoundKey);
  const imageIds = new Set(articleBlocks.map((block) => block.imageId).filter((id): id is string => Boolean(id)));
  // TRI-R04b2 — operator-confirmed alias records (ref → imageId) are
  // consulted first; the id/originalName equality is the fallback for
  // refs with no alias record.
  const requiredImageIds = images
    .filter((image) => (article.imageRefs ?? []).some((ref) => image.id === ref || image.originalName === ref || articleImageMatchesRef(image, article, ref)))
    .map((image) => image.id);
  if (articleBlocks.length === 0) throw new Error(`story compound omitted source article ${article.id}`);
  const missing = requiredImageIds.filter((id) => !imageIds.has(id));
  if (missing.length > 0) throw new Error(`story compound omitted linked images: ${missing.join(", ")}`);
}
