import type {
  Article,
  AssembledLayout,
  GridSpec,
  LayoutBlock,
  NewsImage,
  RecurringSection,
  TemplateSlot,
  VisualPersonality,
} from "@newsforge/shared/schemas";
import { assembleLayout } from "./layoutAssembly.js";
import { chooseVisualPersonality } from "./designLanguage.js";
import {
  porterOneReferenceIdForTemplate,
  scorePorterOneReferenceAffinity,
} from "./porterOneReferenceScorer.js";

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
  | "photo-band-expand"
  | "grammar-feature-stack"
  | "grammar-photo-mosaic";

type CompositionGrammar =
  | "lead-story-collage"
  | "events-and-milestones"
  | "director-note-feature"
  | "photo-recap-spread"
  | "mixed-briefs";

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
  visualPersonality: VisualPersonality;
  compositionGrammar: CompositionGrammar;
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
  grammarAffinity: number;
  porterReferenceAffinity?: number;
  porterReferenceId?: string;
  usefulOccupancy?: number;
  renderFit?: number;
}

export interface CandidateMeasurement {
  candidateId: string;
  clippedBlocks: number;
  clippedBlockIds?: string[];
  clipDetails?: Array<{ blockId: string; overflowPx: number }>;
  overflowBlocks: number;
  missingImages: number;
  renderedImages: number;
  totalImages: number;
  usefulOccupancy: number;
  geometricCoverage?: number;
  minPageUtility?: number;
  largestEmptyBandRatio?: number;
  lowUtilityBlocks: number;
  pageMetrics?: Array<{
    page: number;
    blockCount: number;
    contentBlockCount: number;
    imageBlocks: number;
    clippedBlocks: number;
    overflowBlocks: number;
    missingImages: number;
    renderFit: number;
    usefulOccupancy: number;
  }>;
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

/**
 * Keep family-defining geometry anchored after an AI layout is normalized.
 * Panel Garden's identity is its flanking rails and paired photo features;
 * Photo Festival's identity is its collage zones and compact callouts.
 * Allowing the model to turn those seeded slots into generic wide bands makes
 * the result look like a template filler instead of the Porter reference.
 * Content, order, colors, and new blocks remain AI-owned.
 */
export function applyPorterFamilyGeometryGuard(
  layout: AssembledLayout,
  templateId: string,
  skeleton: AssembledLayout,
): AssembledLayout {
  const familyPrefix = templateId === "v3-panel-garden"
    ? "pg-"
    : templateId === "v3-photo-festival"
      ? "pf-"
      : undefined;
  if (!familyPrefix) return layout;
  const seeded = new Map(skeleton.blocks.map((block) => [block.slotId, block]));
  const blocks = layout.blocks.map((block) => {
    const source = seeded.get(block.slotId);
    if (!source) return block;
    const style = { ...(block.style ?? {}) };
    if (familyPrefix === "pg-" && /^pg-p[12]-(?:bday|brunch|hh|events|anniv|legacy)$/.test(block.slotId)) {
      style.panelRole = style.panelRole ?? "featureBand";
    }
    if (familyPrefix === "pg-" && /^pg-p[12]-img/.test(block.slotId)) {
      style.photoTreatment = style.photoTreatment ?? "collage";
    }
    if (familyPrefix === "pf-" && /^pf-p[12]-img(?:[1-4]|[7-9]|10)$/.test(block.slotId)) {
      style.photoTreatment = style.photoTreatment ?? "collage";
      style.panelRole = style.panelRole ?? "photoCluster";
    }
    return {
      ...block,
      position: { ...source.position },
      style,
    };
  });
  return { ...layout, blocks };
}

interface AdaptiveLayoutInput {
  templateId: string;
  pageCount: number;
  gridSpec: GridSpec;
  articles: Article[];
  images: NewsImage[];
  recurringSections: RecurringSection[];
  brandVoice?: string;
  clientName?: string;
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

function chooseCompositionGrammar(
  articles: Article[],
  images: NewsImage[],
  photoGoal: EditorialPlan["photoGoal"],
): CompositionGrammar {
  const roles = articles.map(roleForArticle);
  const hasLead = roles.includes("lead");
  const hasExecutiveNote = roles.includes("executive-note");
  const hasEvent = roles.includes("event");
  const hasMilestones = roles.includes("recurring");

  if (photoGoal === "photo-led" && images.length >= 4) return "photo-recap-spread";
  if (hasEvent && hasMilestones) return "events-and-milestones";
  if (hasLead && hasExecutiveNote) return "director-note-feature";
  if (hasLead && images.length >= 2) return "lead-story-collage";
  return "mixed-briefs";
}

export function createEditorialPlan(
  articles: Article[],
  images: NewsImage[],
  options: { brandVoice?: string; clientName?: string } = {},
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
  const compositionGrammar = chooseCompositionGrammar(articles, images, photoGoal);
  const visualPersonality = chooseVisualPersonality({
    brandVoice: options.brandVoice,
    clientName: options.clientName,
    photoGoal,
    density,
    compositionGrammar,
  });
  return {
    leadArticleId: items[0]?.articleId,
    items,
    photoGoal,
    density,
    visualPersonality,
    compositionGrammar,
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
  const hasGrammarSlot = layout.blocks.some((block) => block.slotId.startsWith("grammar-"));
  const grammarAffinity = hasGrammarSlot
    ? 1
    : plan.compositionGrammar === "mixed-briefs"
      ? 0.72
      : 0.48;
  const reference = scorePorterOneReferenceAffinity(
    layout,
    input.gridSpec,
    porterOneReferenceIdForTemplate(input.templateId),
  );
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
    grammarAffinity,
    porterReferenceAffinity: reference.affinity,
    porterReferenceId: reference.referenceId,
  };
  const score =
    0.13 * subscores.occupancy +
    0.13 * subscores.contentCoverage +
    0.17 * subscores.requiredCoverage +
    0.08 * subscores.balance +
    0.13 * subscores.clippingRisk +
    0.07 * subscores.geometryValidity +
    0.04 * subscores.photoImpact +
    0.03 * subscores.grammarAffinity +
    0.22 * (subscores.porterReferenceAffinity ?? 0);
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
  const geometricCoverage = measurement.geometricCoverage == null
    ? 1
    : Math.max(0, Math.min(1, measurement.geometricCoverage));
  const minPageUtility = measurement.minPageUtility == null
    ? usefulOccupancy
    : Math.max(0, Math.min(1, measurement.minPageUtility));
  const largestEmptyBandRatio = measurement.largestEmptyBandRatio == null
    ? 0
    : Math.max(0, Math.min(1, measurement.largestEmptyBandRatio));
  const subscores = { ...candidate.subscores, renderFit, usefulOccupancy };
  const underfillPenalty = Math.max(0, 0.86 - usefulOccupancy) * 0.18;
  const coveragePenalty = Math.max(0, 0.9 - geometricCoverage) * 0.3;
  const pageUtilityPenalty = Math.max(0, 0.72 - minPageUtility) * 0.24;
  const emptyBandPenalty = Math.max(0, largestEmptyBandRatio - 0.18) * 0.2;
  const renderPenalty = (1 - renderFit) * 0.35;
  const lowUtilityPenalty = measurement.lowUtilityBlocks * 0.055;
  const referenceAffinity = candidate.subscores.porterReferenceAffinity ?? 0;
  const score = Math.max(
    0,
    candidate.score * 0.38 +
      renderFit * 0.17 +
      usefulOccupancy * 0.19 +
      geometricCoverage * 0.14 +
      referenceAffinity * 0.12 -
      renderPenalty -
      underfillPenalty -
      coveragePenalty -
      pageUtilityPenalty -
      emptyBandPenalty -
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

const MAX_VARIATION_USEFUL_OCCUPANCY_DROP = 0.025;

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
  const bestReferenceAffinity = best.subscores.porterReferenceAffinity;
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
    if (
      bestReferenceAffinity != null &&
      candidate.subscores.porterReferenceAffinity != null &&
      bestReferenceAffinity - candidate.subscores.porterReferenceAffinity > 0.05
    ) {
      return false;
    }
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

export function expandPhotoBand(layout: AssembledLayout): AssembledLayout {
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

  const blockerRoom = Math.min(...blockers.map((block) => block.position.rowSpan - 2));
  const delta = Math.min(3, Math.max(0, blockerRoom), bandTop - 1);
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

function contentBlocksOnPage(layout: AssembledLayout, page: number): LayoutBlock[] {
  return layout.blocks.filter(
    (block) => block.page === page && (block.articleId || block.imageId),
  );
}

function contentRank(block: LayoutBlock, plan: EditorialPlan): number {
  if (block.articleId === plan.leadArticleId) return 0;
  if (block.imageId) return plan.photoGoal === "photo-led" ? 1 : 2;
  const item = plan.items.find((candidate) => candidate.articleId === block.articleId);
  if (item?.preferredProminence === "feature") return 1;
  if (item?.preferredProminence === "standard") return 3;
  if (item?.preferredProminence === "brief") return 4;
  return 5;
}

function grammarPage(
  layout: AssembledLayout,
  plan: EditorialPlan,
  page: number,
  zones: Array<LayoutBlock["position"]>,
): AssembledLayout {
  const pageBlocks = contentBlocksOnPage(layout, page).sort(
    (a, b) => contentRank(a, plan) - contentRank(b, plan) || blockArea(b) - blockArea(a),
  );
  if (pageBlocks.length === 0 || pageBlocks.length > zones.length) return layout;
  const zoneByBlockId = new Map(
    pageBlocks.map((block, index) => [block.blockId, zones[index]]),
  );

  return {
    ...layout,
    blocks: layout.blocks.map((block) => {
      const position = zoneByBlockId.get(block.blockId);
      if (!position) return block;
      return {
        ...block,
        slotId: `grammar-${plan.compositionGrammar}-${block.slotId}`,
        page,
        position,
      };
    }),
  };
}

function scaleZone(
  zone: LayoutBlock["position"],
  gridSpec: GridSpec,
): LayoutBlock["position"] {
  const colScale = gridSpec.columns / 12;
  const rowScale = gridSpec.rowsPerPage / 10;
  const col = Math.max(1, Math.round((zone.col - 1) * colScale) + 1);
  const row = Math.max(1, Math.round((zone.row - 1) * rowScale) + 1);
  const colSpan = Math.max(1, Math.round(zone.colSpan * colScale));
  const rowSpan = Math.max(1, Math.round(zone.rowSpan * rowScale));
  return {
    col,
    row,
    colSpan: Math.min(colSpan, gridSpec.columns - col + 1),
    rowSpan: Math.min(rowSpan, gridSpec.rowsPerPage - row + 1),
  };
}

function applyFeatureStackGrammar(
  layout: AssembledLayout,
  plan: EditorialPlan,
  gridSpec: GridSpec,
): AssembledLayout {
  if (
    plan.compositionGrammar !== "lead-story-collage" &&
    plan.compositionGrammar !== "director-note-feature" &&
    plan.compositionGrammar !== "events-and-milestones"
  ) {
    return layout;
  }
  if (gridSpec.columns < 12 || gridSpec.rowsPerPage < 9) return layout;
  const zones: Array<LayoutBlock["position"]> = [
    { col: 1, row: 1, colSpan: 7, rowSpan: 4 },
    { col: 8, row: 1, colSpan: 5, rowSpan: 4 },
    { col: 1, row: 5, colSpan: 6, rowSpan: 3 },
    { col: 7, row: 5, colSpan: 6, rowSpan: 3 },
    { col: 1, row: 8, colSpan: 12, rowSpan: Math.min(3, gridSpec.rowsPerPage - 7) },
  ].map((zone) => scaleZone(zone, gridSpec));
  return grammarPage(layout, plan, 1, zones);
}

function applyPhotoMosaicGrammar(
  layout: AssembledLayout,
  plan: EditorialPlan,
  gridSpec: GridSpec,
): AssembledLayout {
  if (plan.compositionGrammar !== "photo-recap-spread" && plan.photoGoal !== "photo-led") {
    return layout;
  }
  if (gridSpec.columns < 12 || gridSpec.rowsPerPage < 9) return layout;
  const targetPage =
    [2, 1].find((page) => contentBlocksOnPage(layout, page).filter((block) => block.imageId).length >= 2) ?? 1;
  const zones: Array<LayoutBlock["position"]> = [
    { col: 1, row: 1, colSpan: 4, rowSpan: 4 },
    { col: 5, row: 1, colSpan: 4, rowSpan: 4 },
    { col: 9, row: 1, colSpan: 4, rowSpan: 4 },
    { col: 1, row: 5, colSpan: 8, rowSpan: 3 },
    { col: 9, row: 5, colSpan: 4, rowSpan: 3 },
    { col: 1, row: 8, colSpan: 12, rowSpan: Math.min(3, gridSpec.rowsPerPage - 7) },
  ].map((zone) => scaleZone(zone, gridSpec));
  return grammarPage(layout, plan, targetPage, zones);
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
  if (variant === "grammar-feature-stack") {
    return keepIfValid(applyFeatureStackGrammar(layout, plan, gridSpec));
  }
  if (variant === "grammar-photo-mosaic") {
    return keepIfValid(applyPhotoMosaicGrammar(layout, plan, gridSpec));
  }
  return keepIfValid(swapBlockPositions(layout, firstListOrBriefBlock(layout), firstImageBlock(layout)));
}

export function buildAdaptiveLayout(input: AdaptiveLayoutInput): AdaptiveLayoutResult {
  const plan = createEditorialPlan(input.articles, input.images, {
    brandVoice: input.brandVoice,
    clientName: input.clientName,
  });
  const candidates = [
    makeCandidate("source-order", "Source order", input, plan, "source", "source", "fixed"),
    makeCandidate("editorial-priority", "Editorial priority", input, plan, "editorial", "uploadedFirst", "lead-photo-swap"),
    makeCandidate("photo-impact", "Photo impact", input, plan, "editorial", "landscapeFirst", "photo-lead-swap"),
    makeCandidate("briefs-first", "Briefs and recurring modules first", input, plan, "briefsFirst", "uploadedFirst", "brief-rail-swap"),
    makeCandidate("text-photo-rebalance", "Text/photo rebalance", input, plan, "editorial", "uploadedFirst", "text-photo-rebalance"),
    makeCandidate("photo-band-expand", "Photo band expansion", input, plan, "source", "landscapeFirst", "photo-band-expand"),
    makeCandidate("grammar-feature-stack", "Grammar: feature stack", input, plan, "editorial", "uploadedFirst", "grammar-feature-stack"),
    makeCandidate("grammar-photo-mosaic", "Grammar: photo mosaic", input, plan, "editorial", "landscapeFirst", "grammar-photo-mosaic"),
  ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { plan, candidates, chosen: chooseAdaptiveCandidate(candidates, input.variationSeed) };
}
