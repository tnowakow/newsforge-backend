import type { Article, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import {
  LETTER_RENDER_CONTRACT,
  PT_TO_PX,
  inchesToCssPx,
  type RenderContract,
} from "@newsforge/shared";
import { getPage } from "../browser.js";
import { articleImageMatchesRef } from "./porterSourceSemantics.js";

export type StoryModuleKind =
  | "director"
  | "story-image"
  | "story-image-pair"
  | "long-text-columns"
  | "compact-list"
  | "tall-list-rail"
  | "photo-only"
  | "text-only";

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
  captionFont?: string;
  bodyPt?: number;
  headingPt?: number;
  captionPt?: number;
  lineHeight?: number;
  minHeightPx?: number;
  columns?: number;
  /** Fixed photo frame height when measuring text+photo side-by-side modules. */
  photoFrameHeightPx?: number;
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
  /** True when this measurement came from Chromium rather than a synthetic path. */
  measured: true;
}

const runCache = new Map<string, StoryModuleMeasurement>();

/** Export contract style version so composers share one invalidation key. */
export function storyModuleStyleVersion(contract: RenderContract = LETTER_RENDER_CONTRACT): string {
  return [
    contract.id,
    contract.type.bodyPt,
    contract.type.headingPt ?? contract.roles.heading.pt,
    contract.type.captionPt,
    contract.type.lineHeight,
    contract.gutterPx,
    contract.roles.body.fontStack,
    contract.roles.heading.fontStack,
  ].join("|");
}

export function storyModuleFontVersion(contract: RenderContract = LETTER_RENDER_CONTRACT): string {
  return contract.fontAvailability.required.join("+");
}

/** Content-box height available for the grid on one letter page (CSS px @ 96dpi). */
export function pageContentHeightPx(contract: RenderContract = LETTER_RENDER_CONTRACT): number {
  const pageH = inchesToCssPx(contract.page.heightIn);
  const top = inchesToCssPx(contract.marginsIn.top);
  const bottom = inchesToCssPx(contract.marginsIn.bottom);
  const header = inchesToCssPx(contract.headerHeightIn);
  const footer = inchesToCssPx(contract.footerHeightIn);
  // masthead margin-bottom ~0.08in in renderHtml
  const mastheadGap = inchesToCssPx(0.08);
  return Math.max(1, pageH - top - bottom - header - footer - mastheadGap);
}

/** Content-box width for the full page grid. */
export function pageContentWidthPx(contract: RenderContract = LETTER_RENDER_CONTRACT): number {
  const pageW = inchesToCssPx(contract.page.widthIn);
  const left = inchesToCssPx(contract.marginsIn.left);
  const right = inchesToCssPx(contract.marginsIn.right);
  return Math.max(1, pageW - left - right);
}

/** Convert a measured module height into grid row spans for a given grid. */
export function heightPxToRows(
  heightPx: number,
  rowsPerPage: number,
  contract: RenderContract = LETTER_RENDER_CONTRACT,
  gapPx = 4,
): number {
  const contentH = pageContentHeightPx(contract);
  const usable = Math.max(1, contentH - gapPx * Math.max(0, rowsPerPage - 1));
  const rowH = usable / rowsPerPage;
  return Math.max(1, Math.min(rowsPerPage, Math.ceil(heightPx / rowH)));
}

/** Column width in CSS px for a colSpan on the page grid. */
export function colSpanToWidthPx(
  colSpan: number,
  columns: number,
  contract: RenderContract = LETTER_RENDER_CONTRACT,
  gapPx = 4,
): number {
  const contentW = pageContentWidthPx(contract);
  const usable = Math.max(1, contentW - gapPx * Math.max(0, columns - 1));
  return Math.max(1, Math.floor((usable / columns) * colSpan));
}

function stableKey(input: StoryModuleInput): string {
  const article = input.article
    ? {
        id: input.article.id,
        title: input.article.title,
        body: input.article.body,
        byline: input.article.byline,
        // body text is the source of truth; wordCount alone must not cache-hit stale text
      }
    : null;
  const images = (input.images ?? []).map((image) => ({
    id: image.id,
    url: image.url,
    caption: image.caption,
    width: image.width,
    height: image.height,
    focalX: image.focalX,
    focalY: image.focalY,
    zoom: image.zoom,
    fitMode: image.fitMode,
    cropBox: (image as NewsImage & { cropBox?: unknown }).cropBox,
  }));
  return JSON.stringify({
    kind: input.kind,
    widthPx: input.widthPx,
    styleVersion: input.styleVersion,
    fontVersion: input.fontVersion,
    headingFont: input.headingFont,
    bodyFont: input.bodyFont,
    captionFont: input.captionFont,
    bodyPt: input.bodyPt,
    headingPt: input.headingPt,
    captionPt: input.captionPt,
    lineHeight: input.lineHeight,
    minHeightPx: input.minHeightPx,
    columns: input.columns,
    photoFrameHeightPx: input.photoFrameHeightPx,
    article,
    images,
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
}

function listRows(body: string): string {
  return body
    .split(/\n+|;\s*/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const match = row.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
      if (match) {
        return `<div class="list-row"><span class="list-label">${esc(match[1])}</span><span class="list-value">${esc(match[2])}</span></div>`;
      }
      return `<div class="list-row"><span class="list-label">${esc(row)}</span></div>`;
    })
    .join("");
}

function imageMarkup(image: NewsImage, frameHeightPx: number): string {
  const focalX = image.focalX ?? 50;
  const focalY = image.focalY ?? 50;
  const zoom = image.zoom ?? 1;
  // "fill" is deliberately not emitted: it distorts source photos.
  const fit = image.fitMode === "contain" ? "contain" : "cover";
  return `<figure class="photo module-photo"><div class="photo-frame" style="height:${frameHeightPx}px"><img src="${esc(image.url)}" alt="${esc(image.alt ?? "")}" data-image-id="${esc(image.id)}" style="object-fit:${fit};object-position:${focalX}% ${focalY}%;transform:scale(${zoom});transform-origin:${focalX}% ${focalY}%;"/></div>${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}</figure>`;
}

function articleMarkup(input: StoryModuleInput): string {
  const article = input.article;
  if (!article) return "";
  const list = input.kind === "compact-list" || input.kind === "tall-list-rail";
  const columns =
    input.kind === "long-text-columns" || input.kind === "director"
      ? Math.max(2, input.columns ?? 2)
      : 1;
  const bodyHtml = list ? listRows(article.body) : paragraphs(article.body);
  return `<article class="module-copy block-inner${list ? " module-list" : ""}" style="column-count:${columns};column-gap:12px"><h2 class="section-heading">${esc(article.title)}</h2>${article.byline ? `<div class="byline">By ${esc(article.byline)}</div>` : ""}<div class="${list ? "list-body" : "body"}">${bodyHtml}</div></article>`;
}

function moduleMarkup(input: StoryModuleInput): string {
  const images = input.images ?? [];
  const frameH = input.photoFrameHeightPx ?? 160;
  const imageHtml = images.map((image) => imageMarkup(image, frameH)).join("");
  const layout =
    input.kind === "photo-only"
      ? "module-photo-only"
      : input.kind === "text-only" || images.length === 0
        ? "module-text-only"
        : input.kind === "story-image-pair" || images.length > 1
          ? "module-pair"
          : "module-side";
  return `<main class="story-module module-${input.kind} ${layout}">${articleMarkup(input)}<div class="module-images">${imageHtml}</div></main>`;
}

/** Production-aligned CSS: same roles/sizes/fonts as renderHtml export path. */
function moduleCss(input: StoryModuleInput): string {
  const contract = LETTER_RENDER_CONTRACT;
  const headingFont = input.headingFont ?? contract.fonts.heading;
  const bodyFont = input.bodyFont ?? contract.fonts.body;
  const captionFont = input.captionFont ?? contract.fonts.body;
  const bodyPt = input.bodyPt ?? contract.type.bodyPt;
  const headingPt = input.headingPt ?? contract.type.headingPt ?? contract.roles.heading.pt;
  const captionPt = input.captionPt ?? contract.type.captionPt;
  const lineHeight = input.lineHeight ?? contract.type.lineHeight;
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{margin:0;padding:0}
    body{width:${input.widthPx}px;font-family:"${bodyFont}",serif;color:#20242B;background:#fff}
    .story-module{width:100%;display:flex;gap:8px;padding:7px 9px;align-items:stretch}
    .module-text-only{flex-direction:column}
    .module-photo-only .module-copy{display:none}
    .module-side,.module-pair{flex-direction:row}
    .module-copy{min-width:0;flex:1 1 auto}
    .section-heading{font-family:"${headingFont}",sans-serif;font-weight:700;font-size:${headingPt}pt;line-height:1.1;margin:0 0 4px}
    .byline{font-family:"${bodyFont}",serif;font-size:${Math.max(9, bodyPt - 1.5)}pt;margin-bottom:3px;color:#555}
    .body{font-family:"${bodyFont}",serif;font-size:${bodyPt}pt;line-height:${lineHeight};font-weight:400}
    .body p{margin:0 0 6px}
    .list-body{font-family:"${bodyFont}",serif;font-size:${contract.type.listPt}pt;line-height:1.3}
    .list-row{display:flex;gap:6px;padding:2px 0;border-bottom:1px dotted #bbb}
    .list-label{font-weight:600;min-width:2.4em}
    .module-images{display:flex;gap:6px;min-width:0;flex:1 1 auto}
    .module-text-only .module-images{display:none}
    .module-photo{margin:0;min-width:0;flex:1;display:flex;flex-direction:column}
    .photo-frame{width:100%;overflow:hidden;background:#eee}
    .photo-frame img{width:100%;height:100%;display:block}
    figcaption{font-family:"${captionFont}",serif;font-size:${captionPt}pt;line-height:1.15;font-style:italic;text-align:center;padding-top:2px;color:#555}
    .module-long-text-columns .module-copy,.module-director .module-copy{column-fill:auto}
  `;
}

/** Clear measurements between independent runs. Cache is intentionally never persisted. */
export function clearStoryModuleMeasurementCache(): void {
  runCache.clear();
}

/**
 * Measure one complete source module in Chromium using production-aligned
 * markup/CSS/fonts. Failure is explicit: missing source images or required
 * fonts throw instead of being converted to zero.
 */
export async function measureStoryModule(input: StoryModuleInput): Promise<StoryModuleMeasurement> {
  if (!Number.isFinite(input.widthPx) || input.widthPx <= 0) {
    throw new Error("story module width must be positive");
  }
  const cacheKey = stableKey(input);
  const cached = runCache.get(cacheKey);
  if (cached) return { ...cached, sourceImageIds: [...cached.sourceImageIds], missingFonts: [...cached.missingFonts], missingImages: [...cached.missingImages] };

  const contract = LETTER_RENDER_CONTRACT;
  const headingFont = input.headingFont ?? contract.fonts.heading;
  const bodyFont = input.bodyFont ?? contract.fonts.body;
  const images = input.images ?? [];
  const page = await getPage();

  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"/><style>${moduleCss(input)}</style></head><body>${moduleMarkup(input)}</body></html>`,
    { waitUntil: "domcontentloaded", timeout: 12_000 },
  );

  // Wait for fonts + images exactly as export does.
  await page.evaluate(() => (globalThis as any).document?.fonts?.ready).catch(() => undefined);
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 4_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    const doc = (globalThis as any).document;
    const imgs = Array.from(doc.querySelectorAll("img")) as Array<{ complete: boolean; decode?: () => Promise<void> }>;
    await Promise.all(
      imgs.map(async (img) => {
        if (img.complete) return;
        try {
          if (typeof img.decode === "function") await img.decode();
        } catch {
          /* measured as missing below */
        }
      }),
    );
  });

  const result = await page.evaluate(
    ({ requiredFonts, minHeight }) => {
      const doc = (globalThis as any).document;
      const missingFonts = (requiredFonts as string[]).filter((font) => !doc.fonts.check(`16px "${font}"`));
      const imageNodes = Array.from(doc.querySelectorAll(".module-photo img")) as any[];
      const missingImages = imageNodes
        .filter((image) => !image.complete || image.naturalWidth <= 0)
        .map((image) => image.dataset.imageId ?? "unknown");
      const module = doc.querySelector(".story-module") as any;
      if (!module) throw new Error("story module did not render");
      const rect = module.getBoundingClientRect();
      const copy = doc.querySelector(".module-copy") as any;
      const body = doc.querySelector(".body, .list-body") as any;
      const imageAreaPx = imageNodes.reduce((area: number, image: any) => {
        const r = image.getBoundingClientRect();
        return area + r.width * r.height;
      }, 0);
      const copyClipped = Boolean(
        copy && (copy.scrollHeight > copy.clientHeight + 1 || copy.scrollWidth > copy.clientWidth + 1),
      );
      const bodyClipped = Boolean(
        body && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1),
      );
      // Unconstrained measurement: clip only if minHeight forces a short box later.
      const clipped = copyClipped || bodyClipped || rect.height + 0.5 < minHeight;
      return {
        intrinsicHeightPx: Math.ceil(rect.height),
        contentHeightPx: Math.ceil(Math.max(copy?.scrollHeight ?? 0, body?.scrollHeight ?? 0, rect.height)),
        imageAreaPx: Math.ceil(imageAreaPx),
        missingImages,
        missingFonts,
        clipped,
      };
    },
    {
      requiredFonts: contract.fontAvailability.required,
      minHeight: input.minHeightPx ?? 0,
    },
  );

  if (result.missingImages.length > 0) {
    throw new Error(`story module missing images: ${result.missingImages.join(", ")}`);
  }
  if (result.missingFonts.length > 0) {
    throw new Error(`story module missing fonts: ${result.missingFonts.join(", ")}`);
  }

  const measurement: StoryModuleMeasurement = {
    ...result,
    kind: input.kind,
    widthPx: input.widthPx,
    minHeightPx: input.minHeightPx ?? result.intrinsicHeightPx,
    sourceArticleId: input.article?.id,
    sourceImageIds: images.map((image) => image.id),
    cacheKey,
    measured: true,
  };
  runCache.set(cacheKey, measurement);
  return {
    ...measurement,
    sourceImageIds: [...measurement.sourceImageIds],
    missingFonts: [...measurement.missingFonts],
    missingImages: [...measurement.missingImages],
  };
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
    .filter((image) =>
      (article.imageRefs ?? []).some(
        (ref) => image.id === ref || image.originalName === ref || articleImageMatchesRef(image, article, ref),
      ),
    )
    .map((image) => image.id);
  if (articleBlocks.length === 0) throw new Error(`story compound omitted source article ${article.id}`);
  const missing = requiredImageIds.filter((id) => !imageIds.has(id));
  if (missing.length > 0) throw new Error(`story compound omitted linked images: ${missing.join(", ")}`);
}

/** Choose a module kind from source role + linked photo count. */
export function chooseStoryModuleKind(article: Article | undefined, imageCount: number): StoryModuleKind {
  if (!article && imageCount > 0) return "photo-only";
  if (!article) return "text-only";
  const role = article.sourceRole;
  if (role === "director-note" || /director/i.test(article.title)) return "director";
  if (role === "dated-list" || role === "birthday-roster") {
    return imageCount > 0 ? "tall-list-rail" : "compact-list";
  }
  const words = article.wordCount || article.body.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 180 || article.body.length >= 900) return "long-text-columns";
  if (imageCount >= 2) return "story-image-pair";
  if (imageCount === 1) return "story-image";
  return "text-only";
}

/** Point size helpers for contract floor checks. */
export function contractBodyPt(contract: RenderContract = LETTER_RENDER_CONTRACT): number {
  return contract.type.bodyPt;
}

export function ptToPx(pt: number): number {
  return pt * PT_TO_PX;
}
