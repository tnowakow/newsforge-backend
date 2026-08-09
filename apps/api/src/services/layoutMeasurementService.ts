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
      ".body,.list-body,figcaption",
    )) as any[];
    for (const target of clipTargets) {
      const isCaption = target.tagName?.toLowerCase() === "figcaption";
      const clipsVertically = target.scrollHeight > target.clientHeight + 1;
      const clipsHorizontally = target.scrollWidth > target.clientWidth + 1;
      if (clipsVertically || (!isCaption && clipsHorizontally)) {
        const owner = target.closest(".block");
        if (owner) clippedBlockSet.add(owner);
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
    let totalBlockArea = 0;
    let lowUtilityBlocks = 0;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      const area = Math.max(0, rect.width * rect.height);
      if (area <= 0) continue;
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
      weightedUtility += area * utility;
      totalBlockArea += area;
      if (utility < 0.42 && area > 32_000) lowUtilityBlocks += 1;
    }
    return {
      clippedBlocks,
      clippedBlockIds,
      overflowBlocks,
      missingImages: images.length - renderedImages,
      renderedImages,
      totalImages: images.length,
      usefulOccupancy: totalBlockArea > 0 ? weightedUtility / totalBlockArea : 0,
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
