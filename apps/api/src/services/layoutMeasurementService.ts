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
  overflowBlocks: number;
  missingImages: number;
  renderedImages: number;
  totalImages: number;
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
  const measured = await page.evaluate((): DomMeasurement => {
    const doc = (globalThis as any).document;
    const blocks = Array.from(doc.querySelectorAll(".block-inner")) as any[];
    const clippedBlocks = blocks.filter((block) =>
      block.scrollHeight > block.clientHeight + 1 ||
      block.scrollWidth > block.clientWidth + 1,
    ).length;
    const overflowBlocks = (Array.from(doc.querySelectorAll(".block")) as any[]).filter((block) => {
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
    return {
      clippedBlocks,
      overflowBlocks,
      missingImages: images.length - renderedImages,
      renderedImages,
      totalImages: images.length,
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
