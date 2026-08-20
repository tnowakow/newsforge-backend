import type {
  Article,
  BrandKit,
  GridSpec,
  NewsImage,
  RecurringSection,
} from "@newsforge/shared/schemas";
import fs from "node:fs/promises";
import path from "node:path";
import { getPage } from "../browser.js";
import { env } from "../env.js";
import { renderRunHtml } from "./renderHtml.js";
import type {
  AdaptiveLayoutCandidate,
  CandidateMeasurement,
} from "./adaptiveLayoutPlanner.js";

interface MeasureInput {
  clientName: string;
  monthLabel: string;
  brandKit: BrandKit;
  gridSpec: GridSpec;
  articles: Article[];
  images: NewsImage[];
  recurringSections: RecurringSection[];
  candidates: AdaptiveLayoutCandidate[];
}

interface DomMeasurement {
  clippedBlocks: number;
  clippedBlockIds: string[];
  underfilledBlocks: number;
  fillRatios: Array<{ blockId: string; fillRatio: number }>;
  clipDetails: Array<{ blockId: string; overflowPx: number }>;
  overflowBlocks: number;
  missingImages: number;
  renderedImages: number;
  placeholderImages: number;
  realRenderedImages: number;
  totalImages: number;
  usefulOccupancy: number;
  geometricCoverage: number;
  minPageUtility: number;
  largestEmptyBandRatio: number;
  lowUtilityBlocks: number;
  pageMetrics: Array<{
    page: number;
    blockCount: number;
    contentBlockCount: number;
    imageBlocks: number;
    clippedBlocks: number;
    overflowBlocks: number;
    missingImages: number;
    placeholderImages: number;
    renderFit: number;
    usefulOccupancy: number;
  }>;
}

function htmlWithMeasurementBase(html: string): string {
  const baseHref = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/`;
  const baseTag = `<base href="${baseHref}">`;
  return html.includes("<head>")
    ? html.replace("<head>", `<head>${baseTag}`)
    : `${baseTag}${html}`;
}

function mimeForImagePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function localUploadFilename(url: string): string | null {
  const publicBase = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const normalized = url.startsWith(publicBase) ? url.slice(publicBase.length) : url;
  const match = normalized.match(/^\/uploads\/([^?#]+)/);
  if (!match?.[1]) return null;
  try {
    return path.basename(decodeURIComponent(match[1]));
  } catch {
    return path.basename(match[1]);
  }
}

async function imagesWithMeasurementDataUrls(images: NewsImage[]): Promise<NewsImage[]> {
  return Promise.all(
    images.map(async (image) => {
      const filename = localUploadFilename(image.url);
      if (!filename) return image;
      const filePath = path.resolve(env.UPLOAD_DIR, filename);
      try {
        const buf = await fs.readFile(filePath);
        const dataUrl = `data:${mimeForImagePath(filePath)};base64,${buf.toString("base64")}`;
        return { ...image, url: dataUrl };
      } catch {
        return image;
      }
    }),
  );
}

async function measureCandidate(input: Omit<MeasureInput, "candidates"> & {
  candidate: AdaptiveLayoutCandidate;
}): Promise<CandidateMeasurement> {
  const page = await getPage();
  const measurementImages = await imagesWithMeasurementDataUrls(input.images);
  const html = renderRunHtml({
    clientName: input.clientName,
    monthLabel: input.monthLabel,
    brandKit: input.brandKit,
    gridSpec: input.gridSpec,
    layout: input.candidate.layout,
    articles: input.articles,
    images: measurementImages,
    recurringSections: input.recurringSections,
  });
  await page.setContent(htmlWithMeasurementBase(html), { waitUntil: "domcontentloaded", timeout: 8_000 });
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => {
    // Broken/slow remote photos should be measured as missing, not fail the run.
  });
  await page.evaluate(() => (globalThis as any).document?.fonts?.ready).catch(() => {
    // Font readiness is best-effort; continue with layout measurement either way.
  });
  const measured = await page.evaluate((): DomMeasurement => {
    const doc = (globalThis as any).document;
    const blocks = Array.from(doc.querySelectorAll(".block")) as any[];
    const clippedBlockSet = new Set<any>();
    const clipDetails: Array<{ blockId: string; overflowPx: number }> = [];
    const clipTargets = Array.from(doc.querySelectorAll(
      ".body,.list-body",
    )) as any[];
    for (const target of clipTargets) {
      const clipsVertically = target.scrollHeight > target.clientHeight + 1;
      const clipsHorizontally = target.scrollWidth > target.clientWidth + 1;
      if (clipsVertically || clipsHorizontally) {
        const owner = target.closest(".block");
        if (owner && !owner.querySelector(".photo")) {
          clippedBlockSet.add(owner);
          const blockId = owner.getAttribute("data-block-id");
          if (blockId) {
            clipDetails.push({
              blockId,
              overflowPx: Math.max(target.scrollHeight - target.clientHeight, target.scrollWidth - target.clientWidth),
            });
          }
        }
      }
    }
    const clippedBlocks = clippedBlockSet.size;
    const clippedBlockIds = Array.from(clippedBlockSet)
      .map((block) => block.getAttribute("data-block-id"))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const isLoadedImage = (image: any) => image && image.complete && image.naturalWidth > 0;
    const imageLooksPlaceholder = (image: any): boolean => {
      if (!isLoadedImage(image)) return false;
      const marker = `${image.currentSrc ?? ""} ${image.src ?? ""} ${image.alt ?? ""}`.toLowerCase();
      if (image.dataset?.placeholder === "true") return true;
      if (/test[-_\s]?placeholder|placeholder[-_\s]?image|newsletter photo/.test(marker)) return true;
      try {
        const canvas = doc.createElement("canvas") as any;
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        ctx.drawImage(image, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let lowerDark = 0;
        let lowerCount = 0;
        let upperColorful = 0;
        let upperCount = 0;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const r = data[idx] ?? 0;
            const g = data[idx + 1] ?? 0;
            const b = data[idx + 2] ?? 0;
            const brightness = (r + g + b) / 3;
            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            if (y >= Math.floor(size * 0.72)) {
              lowerCount += 1;
              if (brightness < 38) lowerDark += 1;
            } else {
              upperCount += 1;
              if (chroma > 45 && brightness > 70) upperColorful += 1;
            }
          }
        }
        const lowerDarkRatio = lowerCount > 0 ? lowerDark / lowerCount : 0;
        const upperColorfulRatio = upperCount > 0 ? upperColorful / upperCount : 0;
        return lowerDarkRatio > 0.68 && upperColorfulRatio > 0.18;
      } catch {
        return false;
      }
    };
    const fillRatios: Array<{ blockId: string; fillRatio: number }> = [];
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const id = block.getAttribute("data-block-id");
      if (!id) continue;
      const image = block.querySelector(".photo img") as any;
      let fillRatio = 0;
      if (image) {
        fillRatio = isLoadedImage(image) && !imageLooksPlaceholder(image) ? 1 : 0;
      } else {
        const contentNodes = Array.from(block.querySelectorAll(
          ".section-heading,.script-heading,.byline,.body p,.list-row,.list-group,figcaption",
        )) as any[];
        const contentRects = contentNodes
          .map((node) => node.getBoundingClientRect())
          .filter((r) => r.width > 1 && r.height > 1);
        if (contentRects.length > 0) {
          const top = Math.min(...contentRects.map((r) => r.top));
          const bottom = Math.max(...contentRects.map((r) => r.bottom));
          fillRatio = Math.max(0, Math.min(1, (bottom - rect.top) / Math.max(rect.height, 1)));
        }
      }
      fillRatios.push({ blockId: id, fillRatio });
    }
    const underfilledBlocks = fillRatios.filter((entry) => entry.fillRatio < 0.8).length;
    const pageBoundaryOverflowSet = new Set<any>(blocks.filter((block) => {
      const rect = block.getBoundingClientRect();
      const pageRect = block.closest(".page")?.getBoundingClientRect();
      if (!pageRect) return false;
      return (
        rect.left < pageRect.left - 1 ||
        rect.top < pageRect.top - 1 ||
        rect.right > pageRect.right + 1 ||
        rect.bottom > pageRect.bottom + 1
      );
    }));
    const overlapBlockSet = new Set<any>();
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i];
      const aPage = a.closest(".page");
      const aRect = a.getBoundingClientRect();
      if (!aPage || aRect.width <= 1 || aRect.height <= 1) continue;
      for (let j = i + 1; j < blocks.length; j++) {
        const b = blocks[j];
        if (b.closest(".page") !== aPage) continue;
        const bRect = b.getBoundingClientRect();
        if (bRect.width <= 1 || bRect.height <= 1) continue;
        const overlapWidth = Math.min(aRect.right, bRect.right) - Math.max(aRect.left, bRect.left);
        const overlapHeight = Math.min(aRect.bottom, bRect.bottom) - Math.max(aRect.top, bRect.top);
        if (overlapWidth > 2 && overlapHeight > 2) {
          overlapBlockSet.add(a);
          overlapBlockSet.add(b);
        }
      }
    }
    const overflowBlocks = new Set([...pageBoundaryOverflowSet, ...overlapBlockSet]).size;
    const images = Array.from(doc.querySelectorAll(".photo img")) as any[];
    const renderedImages = images.filter(isLoadedImage).length;
    const placeholderImages = images.filter(imageLooksPlaceholder).length;
    const realRenderedImages = Math.max(0, renderedImages - placeholderImages);
    let weightedUtility = 0;
    let totalContentArea = 0;
    let totalCoveredArea = 0;
    let minPageUtility = 1;
    let largestEmptyBandRatio = 0;
    let lowUtilityBlocks = 0;
    const pages = Array.from(doc.querySelectorAll(".page")) as any[];
    const pageMetrics: DomMeasurement["pageMetrics"] = [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const content = page.querySelector(".content") as any;
      if (!content) continue;
      const contentRect = content.getBoundingClientRect();
      const contentArea = Math.max(0, contentRect.width * contentRect.height);
      if (contentArea <= 0) continue;
      totalContentArea += contentArea;
      let pageWeightedUtility = 0;
      let pageCoveredArea = 0;
      const rowBuckets = Array.from({ length: 16 }, () => false);
      const pageBlocks = blocks.filter((block) => block.closest(".page") === page);
      const pageClipped = pageBlocks.filter((block) => clippedBlockSet.has(block)).length;
      const pageOverflow = new Set(pageBlocks.filter((block) => {
        const rect = block.getBoundingClientRect();
        const pageRect = block.closest(".page")?.getBoundingClientRect();
        return Boolean(pageRect && (rect.left < pageRect.left - 1 || rect.top < pageRect.top - 1 || rect.right > pageRect.right + 1 || rect.bottom > pageRect.bottom + 1));
      }).concat(pageBlocks.filter((block) => overlapBlockSet.has(block)))).size;
      const pageImages = pageBlocks.filter((block) => block.querySelector(".photo img")).length;
      for (const block of pageBlocks) {
        const rect = block.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, contentRect.right) - Math.max(rect.left, contentRect.left));
        const height = Math.max(0, Math.min(rect.bottom, contentRect.bottom) - Math.max(rect.top, contentRect.top));
        const area = width * height;
        if (area <= 0) continue;
        const startBucket = Math.max(0, Math.floor(((Math.max(rect.top, contentRect.top) - contentRect.top) / contentRect.height) * rowBuckets.length));
        const endBucket = Math.min(rowBuckets.length - 1, Math.floor(((Math.min(rect.bottom, contentRect.bottom) - contentRect.top) / contentRect.height) * rowBuckets.length));
        for (let i = startBucket; i <= endBucket; i++) rowBuckets[i] = true;
        const image = block.querySelector(".photo img") as any;
        let utility = 0;
        if (image) {
          utility = isLoadedImage(image) && !imageLooksPlaceholder(image) ? 1 : 0;
        } else {
          const contentNodes = Array.from(block.querySelectorAll(
            ".section-heading,.script-heading,.byline,.body p,.list-row,.list-group,figcaption",
          )) as any[];
          const contentRects = contentNodes
            .map((node) => node.getBoundingClientRect())
            .filter((r) => r.width > 1 && r.height > 1);
          if (contentRects.length > 0) {
            const top = Math.min(...contentRects.map((r) => r.top));
            const bottom = Math.max(...contentRects.map((r) => r.bottom));
            const left = Math.min(...contentRects.map((r) => r.left));
            const right = Math.max(...contentRects.map((r) => r.right));
            const verticalFill = Math.max(0, Math.min(1, (bottom - top) / Math.max(rect.height, 1)));
            const horizontalFill = Math.max(0.25, Math.min(1, (right - left) / Math.max(rect.width, 1)));
            utility = Math.max(0, Math.min(1, verticalFill * (0.75 + horizontalFill * 0.25) * 1.35));
          }
        }
        pageWeightedUtility += area * utility;
        weightedUtility += area * utility;
        pageCoveredArea += area;
        totalCoveredArea += area;
        if (utility < 0.42 && area > 32_000) lowUtilityBlocks += 1;
      }
      minPageUtility = Math.min(minPageUtility, pageWeightedUtility / contentArea);
      const pageTotalImages = pageBlocks.reduce((sum, block) => sum + (block.querySelector(".photo img") ? 1 : 0), 0);
      const pageRenderedImages = pageBlocks.filter((block) => {
        const image = block.querySelector(".photo img") as any;
        return isLoadedImage(image);
      }).length;
      const pagePlaceholderImages = pageBlocks.filter((block) => {
        const image = block.querySelector(".photo img") as any;
        return imageLooksPlaceholder(image);
      }).length;
      const pageContentBlocks = pageBlocks.filter((block) => {
        const kind = block.getAttribute("data-kind");
        return kind !== "empty" && (block.querySelector(".body,.list-body,.section-heading,.script-heading") || block.querySelector(".photo img"));
      }).length;
      let emptyRun = 0;
      let maxEmptyRun = 0;
      for (const occupied of rowBuckets) {
        if (occupied) {
          maxEmptyRun = Math.max(maxEmptyRun, emptyRun);
          emptyRun = 0;
        } else {
          emptyRun += 1;
        }
      }
      maxEmptyRun = Math.max(maxEmptyRun, emptyRun);
      largestEmptyBandRatio = Math.max(largestEmptyBandRatio, maxEmptyRun / rowBuckets.length);
      const pageUtility = pageWeightedUtility / contentArea;
      const pageRenderFit = Math.max(0, 1 - pageClipped / Math.max(pageBlocks.length, 1) - pageOverflow / Math.max(pageBlocks.length, 1) - (pageTotalImages - pageRenderedImages + pagePlaceholderImages) / Math.max(pageTotalImages, 1));
      pageMetrics.push({
        page: pageIndex + 1,
        blockCount: pageBlocks.length,
        contentBlockCount: pageContentBlocks,
        imageBlocks: pageImages,
        clippedBlocks: pageClipped,
        overflowBlocks: pageOverflow,
        missingImages: pageTotalImages - pageRenderedImages,
        placeholderImages: pagePlaceholderImages,
        renderFit: pageRenderFit,
        usefulOccupancy: pageUtility,
      });
    }
    return {
      clippedBlocks,
      clippedBlockIds,
      underfilledBlocks,
      fillRatios,
      clipDetails,
      overflowBlocks,
      missingImages: images.length - renderedImages,
      renderedImages,
      placeholderImages,
      realRenderedImages,
      totalImages: images.length,
      usefulOccupancy: totalContentArea > 0 ? weightedUtility / totalContentArea : 0,
      geometricCoverage: totalContentArea > 0 ? totalCoveredArea / totalContentArea : 0,
      minPageUtility: minPageUtility === 1 ? 0 : minPageUtility,
      largestEmptyBandRatio,
      lowUtilityBlocks,
      pageMetrics,
    };
  });
  return {
    candidateId: input.candidate.id,
    ...measured,
  };
}

export async function measureAdaptiveCandidates(
  input: MeasureInput,
): Promise<CandidateMeasurement[]> {
  const measurements: CandidateMeasurement[] = [];
  for (const candidate of input.candidates) {
    measurements.push(await measureCandidate({ ...input, candidate }));
  }
  return measurements;
}
