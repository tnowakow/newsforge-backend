import type {
  Article,
  AssembledLayout,
  GridSpec,
  LayoutBlock,
  NewsImage,
  RecurringSection,
  TemplateSlot,
} from "@newsforge/shared/schemas";
import { assembleLayout } from "./layoutAssembly.js";

type EditorialRole =
  | "lead"
  | "executive-note"
  | "event"
  | "service"
  | "recurring"
  | "supporting";

type GeometryVariant =
  | "fixed"
  | "lead-photo-swap"
  | "photo-lead-swap"
  | "brief-rail-swap"
  | "text-photo-rebalance"
  | "photo-band-expand";

export interface EditorialPlanItem {
  articleId: string;
  role: EditorialRole;
  priority: number;
  required: boolean;
  preferredProminence: "hero" | "feature" | "standard" | "brief";
  trimMode: "preserve" | "sentence" | "brief";
}

export interface EditorialPlan {
  leadArticleId?: string;
  items: EditorialPlanItem[];
  photoGoal: "text-led" | "balanced" | "photo-led";
  density: "sparse" | "moderate" | "dense";
  requiredArticleIds: string[];
}

export interface AdaptiveCandidateScore {
  occupancy: number;
  contentCoverage: number;
  requiredCoverage: number;
  balance: number;
  clippingRisk: number;
  geometryValidity: number;
  photoImpact: number;
  usefulOccupancy?: number;
  renderFit?: number;
}

export interface CandidateMeasurement {
  candidateId: string;
  clippedBlocks: number;
  clippedBlockIds?: string[];
  overflowBlocks: number;
  missingImages: number;
  renderedImages: number;
  totalImages: number;
  usefulOccupancy: number;
  lowUtilityBlocks: number;
}

export interface AdaptiveLayoutCandidate {
  id: string;
  label: string;
  geometryVariant: GeometryVariant;
  layout: AssembledLayout;
  score: number;
  subscores: AdaptiveCandidateScore;
  warnings: string[];
  measurement?: CandidateMeasurement;
}

export interface AdaptiveLayoutResult {
  plan: EditorialPlan;
  chosen: AdaptiveLayoutCandidate;
  candidates: AdaptiveLayoutCandidate[];
}

interface AdaptiveLayoutInput {
  templateId: string;
  pageCount: number;
  gridSpec: GridSpec;
  articles: Article[];
  images: NewsImage[];
  recurringSections: RecurringSection[];
  previousVersion?: number;
  variationSeed?: string;
}

function roleForArticle(article: Article): EditorialRole {
  if (article.articleType === "resident-story") return "lead";
  if (article.articleType === "executive-note") return "executive-note";
  if (article.articleType === "event-recap") return "event";
  if (article.articleType === "birthday") return "recurring";
  if (/trust fund|business office|volunteer|make the difference/i.test(article.title)) {
    return "service";
  }
  if (/spotlight|meet|profile|story/i.test(article.title)) return "lead";
  if (/director|executive/i.test(article.title)) return "executive-note";
  if (/event|outing|happy hour|calendar|activity/i.test(article.title)) return "event";
  return "supporting";
}

function planItem(article: Article): EditorialPlanItem {
  const role = roleForArticle(article);
  const rolePriority: Record<EditorialRole, number> = {
    lead: 100,
    "executive-note": 82,
    event: 70,
    service: 58,
    recurring: 42,
    supporting: 50,
  };
  const uploadBoost = article.source === "UPLOAD" ? 18 : 0;
  const longEnoughBoost = article.wordCount >= 120 ? 6 : 0;
  const priority = rolePriority[role] + uploadBoost + longEnoughBoost;
  return {
    articleId: article.id,
    role,
    priority,
    required: article.source === "UPLOAD" || priority >= 70,
    preferredProminence:
      role === "lead"
        ? "hero"
        : role === "executive-note" || role === "event"
          ? "feature"
          : article.wordCount <= 70
            ? "brief"
            : "standard",
    trimMode:
      role === "lead" || article.source === "UPLOAD"
        ? "preserve"
        : article.wordCount <= 70
          ? "brief"
          : "sentence",
  };
}

function words(articles: Article[]): number {
  return articles.reduce((sum, article) => sum + article.wordCount, 0);
}

export function createEditorialPlan(
  articles: Article[],
  images: NewsImage[],
): EditorialPlan {
  const items = articles
    .map(planItem)
    .sort((a, b) => b.priority - a.priority || a.articleId.localeCompare(b.articleId));
  const totalWords = words(articles);
  const photoGoal =
    images.length >= Math.max(4, articles.length) || images.length >= 8
      ? "photo-led"
      : images.length <= Math.max(1, Math.floor(articles.length / 3))
        ? "text-led"
        : "balanced";
  const density =
    totalWords > 1800 || articles.length >= 14
      ? "dense"
      : totalWords < 700 && articles.length <= 6
        ? "sparse"
        : "moderate";
  return {
    leadArticleId: items[0]?.articleId,
    items,
    photoGoal,
    density,
    requiredArticleIds: items.filter((item) => item.required).map((item) => item.articleId),
  };
}

function slotArea(slot: TemplateSlot): number {
  return slot.colSpan * slot.rowSpan;
}

function blockArea(block: LayoutBlock): number {
  return block.position.colSpan * block.position.rowSpan;
}

function sortedArticleIds(plan: EditorialPlan, mode: "editorial" | "briefsFirst"): string[] {
  const items = [...plan.items];
  if (mode === "briefsFirst") {
    items.sort((a, b) => {
      const aBrief = a.preferredProminence === "brief" ? 1 : 0;
      const bBrief = b.preferredProminence === "brief" ? 1 : 0;
      return bBrief - aBrief || b.priority - a.priority;
    });
  }
  return items.map((item) => item.articleId);
}

function orderArticles(
  articles: Article[],
  plan: EditorialPlan,
  mode: "source" | "editorial" | "briefsFirst",
): Article[] {
  if (mode === "source") return articles;
  const byId = new Map(articles.map((article) => [article.id, article]));
  return sortedArticleIds(plan, mode).flatMap((id) => {
    const article = byId.get(id);
    return article ? [article] : [];
  });
}

function orderImages(
  images: NewsImage[],
  mode: "source" | "landscapeFirst" | "uploadedFirst",
): NewsImage[] {
  if (mode === "source") return images;
  const sourceRank = (image: NewsImage) =>
    image.source === "UPLOAD" ? 0 : image.source === "STOCK" ? 1 : 2;
  const aspectRank = (image: NewsImage) =>
    image.aspect === "landscape" ? 0 : image.aspect === "portrait" ? 1 : 2;
  return [...images].sort((a, b) => {
    if (mode === "uploadedFirst") {
      const bySource = sourceRank(a) - sourceRank(b);
      if (bySource !== 0) return bySource;
    }
    return aspectRank(a) - aspectRank(b) || a.id.localeCompare(b.id);
  });
}

function cellsFor(block: LayoutBlock): string[] {
  const cells: string[] = [];
  for (let c = block.position.col; c < block.position.col + block.position.colSpan; c++) {
    for (let r = block.position.row; r < block.position.row + block.position.rowSpan; r++) {
      cells.push(`${block.page}:${c}:${r}`);
    }
  }
  return cells;
}

function geometryWarnings(layout: AssembledLayout, gridSpec: GridSpec): string[] {
  const warnings: string[] = [];
  const occupied = new Set<string>();
  for (const block of layout.blocks) {
    if (block.position.col + block.position.colSpan - 1 > gridSpec.columns) {
      warnings.push(`out-of-bounds-cols:${block.blockId}`);
    }
    if (block.position.row + block.position.rowSpan - 1 > gridSpec.rowsPerPage) {
      warnings.push(`out-of-bounds-rows:${block.blockId}`);
    }
    for (const cell of cellsFor(block)) {
      if (occupied.has(cell)) warnings.push(`overlap:${block.blockId}`);
      occupied.add(cell);
    }
  }
  return warnings;
}

function scoreCandidate(
  layout: AssembledLayout,
  input: AdaptiveLayoutInput,
  plan: EditorialPlan,
): { score: number; subscores: AdaptiveCandidateScore; warnings: string[] } {
  const warnings = geometryWarnings(layout, input.gridSpec);
  const placedArticleIds = new Set(layout.blocks.flatMap((block) => block.articleId ? [block.articleId] : []));
  const placedRequired = plan.requiredArticleIds.filter((id) => placedArticleIds.has(id)).length;
  const pageAreas = Array.from({ length: input.pageCount }, (_, pageIndex) =>
    layout.blocks
      .filter((block) => block.page === pageIndex + 1 && block.kind !== "empty")
      .reduce((sum, block) => sum + blockArea(block), 0),
  );
  const totalArea = input.gridSpec.columns * input.gridSpec.rowsPerPage * input.pageCount;
  const occupiedArea = pageAreas.reduce((sum, area) => sum + area, 0);
  const avgArea = pageAreas.length ? occupiedArea / pageAreas.length : 0;
  const imbalance = pageAreas.length
    ? pageAreas.reduce((sum, area) => sum + Math.abs(area - avgArea), 0) /
      Math.max(occupiedArea, 1)
    : 1;
  const imageArea = layout.blocks
    .filter((block) => block.imageId)
    .reduce((sum, block) => sum + blockArea(block), 0);
  const textArea = layout.blocks
    .filter((block) => block.articleId)
    .reduce((sum, block) => sum + blockArea(block), 0);
  const desiredPhotoRatio = plan.photoGoal === "photo-led" ? 0.48 : plan.photoGoal === "text-led" ? 0.24 : 0.34;
  const actualPhotoRatio = imageArea / Math.max(imageArea + textArea, 1);
  const clippingRisks = layout.blocks.filter((block) => {
    if (!block.articleId) return false;
    const article = input.articles.find((a) => a.id === block.articleId);
    const slot = input.gridSpec.slots.find((s) => s.id === block.slotId);
    const maxWords = Math.max(slot?.capacity.maxWords ?? 0, blockArea(block) * 12);
    return article ? article.wordCount > maxWords : false;
  }).length;
  const subscores: AdaptiveCandidateScore = {
    occupancy: Math.min(occupiedArea / Math.max(totalArea, 1) / 0.92, 1),
    contentCoverage: placedArticleIds.size / Math.max(input.articles.length, 1),
    requiredCoverage: placedRequired / Math.max(plan.requiredArticleIds.length, 1),
    balance: Math.max(0, 1 - imbalance),
    clippingRisk: Math.max(0, 1 - clippingRisks / Math.max(placedArticleIds.size, 1)),
    geometryValidity: warnings.length === 0 ? 1 : Math.max(0, 1 - warnings.length * 0.2),
    photoImpact: Math.max(0, 1 - Math.abs(actualPhotoRatio - desiredPhotoRatio) / 0.5),
  };
  const score =
    0.20 * subscores.occupancy +
    0.18 * subscores.contentCoverage +
    0.20 * subscores.requiredCoverage +
    0.12 * subscores.balance +
    0.15 * subscores.clippingRisk +
    0.10 * subscores.geometryValidity +
    0.05 * subscores.photoImpact;
  return { score, subscores, warnings };
}

function scoreWithMeasurement(
  candidate: AdaptiveLayoutCandidate,
  measurement: CandidateMeasurement,
): AdaptiveLayoutCandidate {
  const totalBlocks = Math.max(candidate.layout.blocks.length, 1);
  const totalImages = Math.max(measurement.totalImages, 1);
  const clippedPenalty = measurement.clippedBlocks / totalBlocks;
  const overflowPenalty = measurement.overflowBlocks / totalBlocks;
  const imagePenalty = measurement.missingImages / totalImages;
  const renderFit = Math.max(0, 1 - clippedPenalty - overflowPenalty - imagePenalty);
  const warnings = [
    ...candidate.warnings,
    ...(measurement.clippedBlocks > 0 ? [`render-clipped-blocks:${measurement.clippedBlocks}`] : []),
    ...(measurement.overflowBlocks > 0 ? [`render-overflow-blocks:${measurement.overflowBlocks}`] : []),
    ...(measurement.missingImages > 0 ? [`render-missing-images:${measurement.missingImages}`] : []),
    ...(measurement.lowUtilityBlocks > 0 ? [`low-utility-blocks:${measurement.lowUtilityBlocks}`] : []),
  ];
  const usefulOccupancy = Math.max(0, Math.min(1, measurement.usefulOccupancy));
  const subscores = { ...candidate.subscores, renderFit, usefulOccupancy };
  const renderPenalty = (1 - renderFit) * 0.35;
  const lowUtilityPenalty = measurement.lowUtilityBlocks * 0.025;
  const score = Math.max(
    0,
    candidate.score * 0.66 + renderFit * 0.20 + usefulOccupancy * 0.14 -
      renderPenalty -
      lowUtilityPenalty,
  );
  return {
    ...candidate,
    score,
    subscores,
    warnings,
    measurement,
  };
}

export function applyCandidateMeasurements(
  candidates: AdaptiveLayoutCandidate[],
  measurements: CandidateMeasurement[],
): AdaptiveLayoutCandidate[] {
  const byId = new Map(measurements.map((measurement) => [measurement.candidateId, measurement]));
  return candidates
    .map((candidate) => {
      const measurement = byId.get(candidate.id);
      return measurement ? scoreWithMeasurement(candidate, measurement) : candidate;
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function seedNumber(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const MAX_VARIATION_USEFUL_OCCUPANCY_DROP = 0.05;

function lowUtilityWarningCount(candidate: AdaptiveLayoutCandidate): number {
  return candidate.warnings.reduce((sum, warning) => {
    const match = /^low-utility-blocks:(\d+)$/.exec(warning);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}

export function chooseAdaptiveCandidate(
  candidates: AdaptiveLayoutCandidate[],
  variationSeed?: string,
): AdaptiveLayoutCandidate {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = sorted[0];
  if (!best || !variationSeed) return best;
  const bestUsefulOccupancy = best.subscores.usefulOccupancy;
  const bestRenderFit = best.subscores.renderFit;
  const bestLowUtilityWarnings = lowUtilityWarningCount(best);
  const nearBest = sorted.filter((candidate) => {
    if (best.score - candidate.score > 0.04) return false;
    if (
      bestRenderFit != null &&
      candidate.subscores.renderFit != null &&
      bestRenderFit - candidate.subscores.renderFit > 0.01
    ) {
      return false;
    }
    if (
      bestUsefulOccupancy != null &&
      candidate.subscores.usefulOccupancy != null &&
      bestUsefulOccupancy - candidate.subscores.usefulOccupancy > MAX_VARIATION_USEFUL_OCCUPANCY_DROP
    ) {
      return false;
    }
    if (lowUtilityWarningCount(candidate) > bestLowUtilityWarnings) return false;
    return true;
  });
  if (nearBest.length <= 1) return best;
  return nearBest[seedNumber(variationSeed) % nearBest.length];
}

function makeCandidate(
  id: string,
  label: string,
  input: AdaptiveLayoutInput,
  plan: EditorialPlan,
  articleMode: "source" | "editorial" | "briefsFirst",
  imageMode: "source" | "landscapeFirst" | "uploadedFirst",
  geometryVariant: GeometryVariant,
): AdaptiveLayoutCandidate {
  const articles = orderArticles(input.articles, plan, articleMode);
  const images = orderImages(input.images, imageMode);
  const layout = applyGeometryVariant(assembleLayout({
    templateId: input.templateId,
    pageCount: input.pageCount,
    gridSpec: input.gridSpec,
    articles,
    images,
    recurringSections: input.recurringSections,
    previousVersion: input.previousVersion,
  }), geometryVariant, plan, input.gridSpec);
  const scored = scoreCandidate(layout, { ...input, articles, images }, plan);
  return {
    id,
    label,
    geometryVariant,
    layout,
    score: scored.score,
    subscores: scored.subscores,
    warnings: scored.warnings,
  };
}

function largestBlock(blocks: LayoutBlock[]): LayoutBlock | undefined {
  return [...blocks].sort((a, b) => blockArea(b) - blockArea(a))[0];
}

function firstImageBlock(layout: AssembledLayout): LayoutBlock | undefined {
  return largestBlock(layout.blocks.filter((block) => block.imageId));
}

function leadArticleBlock(
  layout: AssembledLayout,
  plan: EditorialPlan,
): LayoutBlock | undefined {
  return (
    layout.blocks.find((block) => block.articleId === plan.leadArticleId) ??
    largestBlock(layout.blocks.filter((block) => block.articleId))
  );
}

function firstListOrBriefBlock(layout: AssembledLayout): LayoutBlock | undefined {
  return (
    largestBlock(layout.blocks.filter((block) => block.kind === "list")) ??
    largestBlock(layout.blocks.filter((block) => block.articleId && blockArea(block) <= 24))
  );
}

function swapBlockPositions(
  layout: AssembledLayout,
  first: LayoutBlock | undefined,
  second: LayoutBlock | undefined,
): AssembledLayout {
  if (!first || !second || first.blockId === second.blockId) return layout;
  return {
    ...layout,
    blocks: layout.blocks.map((block) => {
      if (block.blockId === first.blockId) {
        return { ...block, page: second.page, position: second.position };
      }
      if (block.blockId === second.blockId) {
        return { ...block, page: first.page, position: first.position };
      }
      return block;
    }),
  };
}

function overlapLength(aStart: number, aSpan: number, bStart: number, bSpan: number): number {
  const aEnd = aStart + aSpan;
  const bEnd = bStart + bSpan;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

type RebalanceAxis = "horizontal" | "vertical";
type RebalanceTarget = "article" | "image";

interface RebalancePair {
  article: LayoutBlock;
  image: LayoutBlock;
  axis: RebalanceAxis;
  score: number;
}

function findRebalancePairs(layout: AssembledLayout): RebalancePair[] {
  const articles = layout.blocks.filter((block) => block.articleId);
  const images = layout.blocks.filter((block) => block.imageId);
  const pairs: RebalancePair[] = [];

  for (const article of articles) {
    for (const image of images) {
      if (article.page !== image.page) continue;
      const verticalOverlap = overlapLength(
        article.position.row,
        article.position.rowSpan,
        image.position.row,
        image.position.rowSpan,
      );
      const horizontalOverlap = overlapLength(
        article.position.col,
        article.position.colSpan,
        image.position.col,
        image.position.colSpan,
      );
      const horizontalAdjacent =
        article.position.col + article.position.colSpan === image.position.col ||
        image.position.col + image.position.colSpan === article.position.col;
      const verticalAdjacent =
        article.position.row + article.position.rowSpan === image.position.row ||
        image.position.row + image.position.rowSpan === article.position.row;
      const verticalOverlapRatio =
        verticalOverlap / Math.max(Math.min(article.position.rowSpan, image.position.rowSpan), 1);
      const horizontalOverlapRatio =
        horizontalOverlap / Math.max(Math.min(article.position.colSpan, image.position.colSpan), 1);

      if (horizontalAdjacent && verticalOverlapRatio >= 0.65) {
        pairs.push({
          article,
          image,
          axis: "horizontal",
          score: verticalOverlapRatio * 100 + Math.min(blockArea(article), 120) + Math.min(blockArea(image), 120),
        });
      }
      if (verticalAdjacent && horizontalOverlapRatio >= 0.65) {
        pairs.push({
          article,
          image,
          axis: "vertical",
          score: horizontalOverlapRatio * 100 + Math.min(blockArea(article), 120) + Math.min(blockArea(image), 120),
        });
      }
    }
  }

  return pairs.sort((a, b) => b.score - a.score);
}

function rebalanceTarget(plan: EditorialPlan): RebalanceTarget {
  if (plan.photoGoal === "photo-led") return "image";
  if (plan.photoGoal === "text-led" || plan.density === "dense") return "article";
  const featureItems = plan.items.filter((item) =>
    item.preferredProminence === "hero" || item.preferredProminence === "feature"
  );
  const briefItems = plan.items.filter((item) => item.preferredProminence === "brief");
  return featureItems.length >= briefItems.length ? "article" : "image";
}

function resizePair(
  layout: AssembledLayout,
  pair: RebalancePair,
  target: RebalanceTarget,
): AssembledLayout {
  const article = pair.article;
  const image = pair.image;
  const donor = target === "article" ? image : article;
  const minDonorSpan = target === "article" ? 3 : 4;
  const spanKey = pair.axis === "horizontal" ? "colSpan" : "rowSpan";
  const donorSpan = donor.position[spanKey];
  const delta = Math.min(2, Math.max(0, donorSpan - minDonorSpan));
  if (delta <= 0) return layout;

  return {
    ...layout,
    blocks: layout.blocks.map((block) => {
      if (block.blockId !== article.blockId && block.blockId !== image.blockId) return block;

      const next = { ...block, position: { ...block.position } };
      const blockIsArticle = block.blockId === article.blockId;
      const blockIsTarget = target === "article" ? blockIsArticle : !blockIsArticle;

      if (pair.axis === "horizontal") {
        const articleLeftOfImage = article.position.col < image.position.col;
        if (blockIsTarget) {
          next.position.colSpan += delta;
          if (!articleLeftOfImage && blockIsArticle) next.position.col -= delta;
          if (articleLeftOfImage && !blockIsArticle) next.position.col -= delta;
        } else {
          next.position.colSpan -= delta;
          if (articleLeftOfImage && !blockIsArticle) next.position.col += delta;
          if (!articleLeftOfImage && blockIsArticle) next.position.col += delta;
        }
      } else {
        const articleAboveImage = article.position.row < image.position.row;
        if (blockIsTarget) {
          next.position.rowSpan += delta;
          if (!articleAboveImage && blockIsArticle) next.position.row -= delta;
          if (articleAboveImage && !blockIsArticle) next.position.row -= delta;
        } else {
          next.position.rowSpan -= delta;
          if (articleAboveImage && !blockIsArticle) next.position.row += delta;
          if (!articleAboveImage && blockIsArticle) next.position.row += delta;
        }
      }

      return next;
    }),
  };
}

function rebalanceTextPhoto(layout: AssembledLayout, plan: EditorialPlan): AssembledLayout {
  const pair = findRebalancePairs(layout)[0];
  if (!pair) return layout;
  return resizePair(layout, pair, rebalanceTarget(plan));
}

function expandPhotoBand(layout: AssembledLayout): AssembledLayout {
  const imageBands = new Map<string, LayoutBlock[]>();
  for (const block of layout.blocks) {
    if (!block.imageId) continue;
    const key = `${block.page}:${block.position.row}`;
    imageBands.set(key, [...(imageBands.get(key) ?? []), block]);
  }
  const band = [...imageBands.values()]
    .filter((blocks) => blocks.length >= 2)
    .sort((a, b) => {
      const widthA = a.reduce((sum, block) => sum + block.position.colSpan, 0);
      const widthB = b.reduce((sum, block) => sum + block.position.colSpan, 0);
      return widthB - widthA || b.length - a.length;
    })[0];
  if (!band) return layout;

  const bandTop = band[0].position.row;
  const bandPage = band[0].page;
  const blockers = layout.blocks.filter((block) => {
    if (block.page !== bandPage || block.imageId) return false;
    if (block.position.row + block.position.rowSpan !== bandTop) return false;
    return band.some((image) =>
      overlapLength(
        block.position.col,
        block.position.colSpan,
        image.position.col,
        image.position.colSpan,
      ) > 0
    );
  });
  if (blockers.length === 0) return layout;

  const blockerRoom = Math.min(...blockers.map((block) => block.position.rowSpan - 3));
  const delta = Math.min(2, Math.max(0, blockerRoom), bandTop - 1);
  if (delta <= 0) return layout;

  const bandIds = new Set(band.map((block) => block.blockId));
  const blockerIds = new Set(blockers.map((block) => block.blockId));
  return {
    ...layout,
    blocks: layout.blocks.map((block) => {
      if (bandIds.has(block.blockId)) {
        return {
          ...block,
          position: {
            ...block.position,
            row: block.position.row - delta,
            rowSpan: block.position.rowSpan + delta,
          },
        };
      }
      if (blockerIds.has(block.blockId)) {
        return {
          ...block,
          position: {
            ...block.position,
            rowSpan: block.position.rowSpan - delta,
          },
        };
      }
      return block;
    }),
  };
}

function applyGeometryVariant(
  layout: AssembledLayout,
  variant: GeometryVariant,
  plan: EditorialPlan,
  gridSpec: GridSpec,
): AssembledLayout {
  if (variant === "fixed") return layout;
  const keepIfValid = (candidate: AssembledLayout) =>
    geometryWarnings(candidate, gridSpec).length === 0 ? candidate : layout;
  if (variant === "lead-photo-swap") {
    return keepIfValid(swapBlockPositions(layout, leadArticleBlock(layout, plan), firstImageBlock(layout)));
  }
  if (variant === "photo-lead-swap") {
    return keepIfValid(swapBlockPositions(layout, firstImageBlock(layout), leadArticleBlock(layout, plan)));
  }
  if (variant === "text-photo-rebalance") {
    return keepIfValid(rebalanceTextPhoto(layout, plan));
  }
  if (variant === "photo-band-expand") {
    return keepIfValid(expandPhotoBand(layout));
  }
  return keepIfValid(swapBlockPositions(layout, firstListOrBriefBlock(layout), firstImageBlock(layout)));
}

export function buildAdaptiveLayout(input: AdaptiveLayoutInput): AdaptiveLayoutResult {
  const plan = createEditorialPlan(input.articles, input.images);
  const candidates = [
    makeCandidate("source-order", "Source order", input, plan, "source", "source", "fixed"),
    makeCandidate("editorial-priority", "Editorial priority", input, plan, "editorial", "uploadedFirst", "lead-photo-swap"),
    makeCandidate("photo-impact", "Photo impact", input, plan, "editorial", "landscapeFirst", "photo-lead-swap"),
    makeCandidate("briefs-first", "Briefs and recurring modules first", input, plan, "briefsFirst", "uploadedFirst", "brief-rail-swap"),
    makeCandidate("text-photo-rebalance", "Text/photo rebalance", input, plan, "editorial", "uploadedFirst", "text-photo-rebalance"),
    makeCandidate("photo-band-expand", "Photo band expansion", input, plan, "source", "landscapeFirst", "photo-band-expand"),
  ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { plan, candidates, chosen: chooseAdaptiveCandidate(candidates, input.variationSeed) };
}
