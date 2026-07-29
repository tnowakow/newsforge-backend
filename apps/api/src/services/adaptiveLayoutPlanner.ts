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
}

export interface AdaptiveLayoutCandidate {
  id: string;
  label: string;
  layout: AssembledLayout;
  score: number;
  subscores: AdaptiveCandidateScore;
  warnings: string[];
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
    const maxWords = slot?.capacity.maxWords ?? blockArea(block) * 12;
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

function makeCandidate(
  id: string,
  label: string,
  input: AdaptiveLayoutInput,
  plan: EditorialPlan,
  articleMode: "source" | "editorial" | "briefsFirst",
  imageMode: "source" | "landscapeFirst" | "uploadedFirst",
): AdaptiveLayoutCandidate {
  const articles = orderArticles(input.articles, plan, articleMode);
  const images = orderImages(input.images, imageMode);
  const layout = assembleLayout({
    templateId: input.templateId,
    pageCount: input.pageCount,
    gridSpec: input.gridSpec,
    articles,
    images,
    recurringSections: input.recurringSections,
    previousVersion: input.previousVersion,
  });
  const scored = scoreCandidate(layout, { ...input, articles, images }, plan);
  return {
    id,
    label,
    layout,
    score: scored.score,
    subscores: scored.subscores,
    warnings: scored.warnings,
  };
}

export function buildAdaptiveLayout(input: AdaptiveLayoutInput): AdaptiveLayoutResult {
  const plan = createEditorialPlan(input.articles, input.images);
  const candidates = [
    makeCandidate("source-order", "Source order", input, plan, "source", "source"),
    makeCandidate("editorial-priority", "Editorial priority", input, plan, "editorial", "uploadedFirst"),
    makeCandidate("photo-impact", "Photo impact", input, plan, "editorial", "landscapeFirst"),
    makeCandidate("briefs-first", "Briefs and recurring modules first", input, plan, "briefsFirst", "uploadedFirst"),
  ].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { plan, candidates, chosen: candidates[0] };
}
