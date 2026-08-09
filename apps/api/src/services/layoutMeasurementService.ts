import type {
  Article,
  BrandKit,
  GridSpec,
  NewsImage,
  RecurringSection,
} from "@newsforge/shared/schemas";
import { getPage } from "../browser.js";
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
  overflowBlocks: number;
  missingImages: number;
  renderedImages: number;
  totalImages: number;
  usefulOccupancy: number;
  geometricCoverage: number;
  minPageUtility: number;
  largestEmptyBandRatio: number;
  lowUtilityBlocks: number;
}

async function measureCandidate(input: Omit<MeasureInput, "candidates"> & {
  candidate: AdaptiveLayoutCandidate;
}): Promise<CandidateMeasurement> {
  const page = await getPage();
  const html = renderRunHtml({
    clientName: input.clientName,
    monthLabel: input.monthLabel,
    brandKit: input.brandKit,
    gridSpec: input.gridSpec,
    layout: input.candidate.layout,
    articles: input.articles,
    images: input.images,
    recurringSections: input.recurringSections,
  });
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 8_000 });
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
    const clipTargets = Array.from(doc.querySelectorAll(
      ".body,.list-body",
    )) as any[];
    for (const target of clipTargets) {
      const clipsVertically = target.scrollHeight > target.clientHeight + 1;
      const clipsHorizontally = target.scrollWidth > target.clientWidth + 1;
      if (clipsVertically || clipsHorizontally) {
        const owner = target.closest(".block");
        if (owner && !owner.querySelector(".photo")) clippedBlockSet.add(owner);
      }
    }
    const clippedBlocks = clippedBlockSet.size;
    const clippedBlockIds = Array.from(clippedBlockSet)
      .map((block) => block.getAttribute("data-block-id"))
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const overflowBlocks = blocks.filter((block) => {
      const rect = block.getBoundingClientRect();
      const pageRect = block.closest(".page")?.getBoundingClientRect();
      if (!pageRect) return false;
      return (
        rect.left < pageRect.left - 1 ||
        rect.top < pageRect.top - 1 ||
        rect.right > pageRect.right + 1 ||
        rect.bottom > pageRect.bottom + 1
      );
    }).length;
    const images = Array.from(doc.querySelectorAll(".photo img")) as any[];
    const renderedImages = images.filter((image) => image.complete && image.naturalWidth > 0).length;
    let weightedUtility = 0;
    let totalContentArea = 0;
    let totalCoveredArea = 0;
    let minPageUtility = 1;
    let largestEmptyBandRatio = 0;
    let lowUtilityBlocks = 0;
    const pages = Array.from(doc.querySelectorAll(".page")) as any[];
    for (const page of pages) {
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
          utility = image.complete && image.naturalWidth > 0 ? 1 : 0;
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
    }
    return {
      clippedBlocks,
      clippedBlockIds,
      overflowBlocks,
      missingImages: images.length - renderedImages,
      renderedImages,
      totalImages: images.length,
      usefulOccupancy: totalContentArea > 0 ? weightedUtility / totalContentArea : 0,
      geometricCoverage: totalContentArea > 0 ? totalCoveredArea / totalContentArea : 0,
      minPageUtility: minPageUtility === 1 ? 0 : minPageUtility,
      largestEmptyBandRatio,
      lowUtilityBlocks,
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
