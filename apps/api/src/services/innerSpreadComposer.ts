import type { Article, AssembledLayout, GridSpec, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import { classifyPorterSourceRole, porterImageMatchesRef } from "./porterSourceSemantics.js";

export type InnerSpreadSkeleton = "rail-two-story" | "wide-feature-supporting" | "text-photo-mosaic";

export interface InnerSpreadContract {
  gridSpec: GridSpec;
  pageCount?: 2;
  bodyFontSizePt?: number;
  captionFontSizePt?: number;
  minBodyFontSizePt?: number;
  maxCandidates?: number;
  maxReflows?: number;
}

export interface InnerSpreadSourceUnit {
  id: string;
  article: Article;
  required?: boolean;
  photoRefs?: string[];
}

export interface InnerSpreadComposeInput {
  source: Article[] | { units: InnerSpreadSourceUnit[] } | InnerSpreadSourceUnit[];
  images: NewsImage[];
  contract: InnerSpreadContract;
}

export interface InnerSpreadPageDiagnostics {
  page: number;
  clipCount: number;
  overlapCount: number;
  usedArea: number;
  contentArea: number;
}

export interface InnerSpreadComposeResult {
  status: "fit" | "overflow";
  layout: AssembledLayout;
  omittedRequiredUnitIds: string[];
  unresolvedRequiredPhotoRefs: string[];
  contentEdits: [];
  pages: InnerSpreadPageDiagnostics[];
  skeleton: InnerSpreadSkeleton;
  candidateCount: number;
  reflowCount: number;
  overflow?: { unitIds: string[]; requiredExtraArea: number; reason: string };
  provider: "deterministic";
  decisionTrace: string[];
}

type Placement = { page: number; col: number; row: number; colSpan: number; rowSpan: number };

const SKELETONS: InnerSpreadSkeleton[] = ["rail-two-story", "wide-feature-supporting", "text-photo-mosaic"];

function unitsFrom(source: InnerSpreadComposeInput["source"]): InnerSpreadSourceUnit[] {
  const raw = Array.isArray(source) ? source : "units" in source ? source.units : source;
  return raw.map((unit, index) => {
    const article = "article" in unit ? unit.article : unit;
    return {
      id: "id" in unit ? unit.id : article.id,
      article: { ...article },
      required: "required" in unit ? unit.required !== false : true,
      photoRefs: "photoRefs" in unit ? [...(unit.photoRefs ?? [])] : [...(article.imageRefs ?? [])],
    };
  }).sort((a, b) => (a.article.sourceOrder ?? 999) - (b.article.sourceOrder ?? 999) || a.id.localeCompare(b.id));
}

function imageLinks(unit: InnerSpreadSourceUnit, images: NewsImage[]): NewsImage[] {
  const refs = unit.photoRefs ?? [];
  return images.filter((image) => refs.some((ref) => porterImageMatchesRef(image, ref)));
}

function estimatedRows(unit: InnerSpreadSourceUnit, imageCount: number, grid: GridSpec): number {
  const words = unit.article.wordCount || unit.article.body.trim().split(/\s+/).filter(Boolean).length;
  const role = classifyPorterSourceRole(unit.article);
  const wordsPerRow = role === "dated-list" || role === "birthday-roster" ? 26 : 34;
  const textRows = Math.max(2, Math.ceil(words / wordsPerRow) + 1);
  return Math.min(grid.rowsPerPage, Math.max(textRows, imageCount ? 4 : 2));
}

function skeletonColumns(kind: InnerSpreadSkeleton, index: number, grid: GridSpec): { text: number; photos: number } {
  if (kind === "rail-two-story" && index === 0) return { text: Math.max(6, Math.floor(grid.columns * 0.34)), photos: grid.columns - Math.max(6, Math.floor(grid.columns * 0.34)) };
  if (kind === "wide-feature-supporting") return { text: Math.max(8, Math.floor(grid.columns * 0.58)), photos: grid.columns - Math.max(8, Math.floor(grid.columns * 0.58)) };
  return { text: Math.max(8, Math.floor(grid.columns * 0.5)), photos: grid.columns - Math.max(8, Math.floor(grid.columns * 0.5)) };
}

function overlap(a: LayoutBlock, b: LayoutBlock): boolean {
  return a.page === b.page && a.position.col < b.position.col + b.position.colSpan && b.position.col < a.position.col + a.position.colSpan && a.position.row < b.position.row + b.position.rowSpan && b.position.row < a.position.row + a.position.rowSpan;
}

function placeCandidate(units: InnerSpreadSourceUnit[], images: NewsImage[], contract: InnerSpreadContract, skeleton: InnerSpreadSkeleton) {
  const grid = contract.gridSpec;
  const blocks: LayoutBlock[] = [];
  const omitted: string[] = [];
  const trace: string[] = [`skeleton:${skeleton}`];
  let page = 1;
  let row = 1;
  let index = 0;
  for (const unit of units) {
    const linked = imageLinks(unit, images);
    const neededRows = estimatedRows(unit, linked.length, grid);
    if (row + neededRows - 1 > grid.rowsPerPage) { page += 1; row = 1; }
    if (page > 2) { if (unit.required !== false) omitted.push(unit.id); continue; }
    const widths = skeletonColumns(skeleton, index, grid);
    const photoWidth = linked.length ? Math.max(4, Math.floor(widths.photos / Math.min(2, linked.length))) : 0;
    const textWidth = linked.length ? widths.text : grid.columns;
    const textBlock: LayoutBlock = {
      blockId: `inner-${unit.id}`, slotId: `source-${unit.id}`, page,
      position: { col: 1, row, colSpan: textWidth, rowSpan: neededRows },
      kind: ["dated-list", "birthday-roster"].includes(classifyPorterSourceRole(unit.article)) ? "list" : "article",
      articleId: unit.article.id, heading: unit.article.title, sourceRole: classifyPorterSourceRole(unit.article), sourceOrder: unit.article.sourceOrder ?? index,
      listItems: undefined, needsFiller: false, style: { compact: true, panelRole: "featureBand" }, compoundId: `inner-${unit.id}`, zIndex: 0,
    };
    blocks.push(textBlock);
    linked.slice(0, 2).forEach((image, imageIndex) => {
      blocks.push({ blockId: `inner-${unit.id}-photo-${image.id}`, slotId: `source-${image.id}`, page,
        position: { col: textWidth + 1 + imageIndex * photoWidth, row, colSpan: Math.min(photoWidth, grid.columns - textWidth - imageIndex * photoWidth), rowSpan: neededRows },
        kind: "image", imageId: image.id, caption: image.caption, sourceRole: classifyPorterSourceRole(unit.article), sourceOrder: unit.article.sourceOrder ?? index,
        needsFiller: false, style: { photoTreatment: "collage", panelRole: "photoCluster" }, compoundId: `inner-${unit.id}`, zIndex: 0 });
    });
    row += neededRows;
    index += 1;
  }
  const pages: InnerSpreadPageDiagnostics[] = [1, 2].map((p) => {
    const pageBlocks = blocks.filter((b) => b.page === p);
    let overlapCount = 0;
    for (let i = 0; i < pageBlocks.length; i += 1) for (let j = i + 1; j < pageBlocks.length; j += 1) if (overlap(pageBlocks[i], pageBlocks[j])) overlapCount += 1;
    const usedArea = pageBlocks.reduce((n, b) => n + b.position.colSpan * b.position.rowSpan, 0);
    return { page: p, clipCount: 0, overlapCount, usedArea, contentArea: grid.columns * grid.rowsPerPage };
  });
  const layout: AssembledLayout = { templateId: "inner-spread-composer", layoutMode: "campus-inner-spread", logicalPageOffset: 1, pageCount: 2, blocks, unfilledSlotIds: [], stats: { placedArticles: blocks.filter((b) => b.articleId).length, placedImages: blocks.filter((b) => b.imageId).length, fillerBlocks: 0, emptySlots: 0 }, version: 1 };
  return { layout, omitted, pages, trace };
}

export async function composeInnerSpread(input: InnerSpreadComposeInput): Promise<InnerSpreadComposeResult> {
  const contract = input.contract;
  const units = unitsFrom(input.source);
  const unresolvedRequiredPhotoRefs = units.flatMap((unit) => (unit.required === false ? [] : (unit.photoRefs ?? []).filter((ref) => !input.images.some((image) => porterImageMatchesRef(image, ref)))));
  const maxCandidates = Math.min(12, Math.max(1, contract.maxCandidates ?? 12));
  let best: ReturnType<typeof placeCandidate> | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const skeleton of SKELETONS.slice(0, maxCandidates)) {
    const candidate = placeCandidate(units, input.images, contract, skeleton);
    const invalid = candidate.omitted.length > 0 || candidate.pages.some((p) => p.overlapCount || p.clipCount);
    const score = (invalid ? 1_000_000 : 0) + candidate.omitted.length * 10000 + candidate.pages.reduce((n, p) => n + (p.contentArea - p.usedArea) ** 2, 0);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  if (!best) throw new Error("inner spread produced no candidate");
  const requiredExtraArea = best.omitted.reduce((n, id) => n + (estimatedRows(units.find((u) => u.id === id)!, 0, contract.gridSpec) * contract.gridSpec.columns), 0);
  const status = best.omitted.length || unresolvedRequiredPhotoRefs.length || best.pages.some((p) => p.overlapCount || p.clipCount) ? "overflow" : "fit";
  return { status, layout: best.layout, omittedRequiredUnitIds: best.omitted, unresolvedRequiredPhotoRefs, contentEdits: [], pages: best.pages, skeleton: SKELETONS.find((s) => best?.trace.includes(`skeleton:${s}`)) ?? "text-photo-mosaic", candidateCount: Math.min(SKELETONS.length, maxCandidates), reflowCount: 0, ...(status === "overflow" ? { overflow: { unitIds: best.omitted, requiredExtraArea, reason: unresolvedRequiredPhotoRefs.length ? "required photo references are unresolved" : "required source units exceed two-page capacity" } } : {}), provider: "deterministic", decisionTrace: [...best.trace, "feasibility-before-density", "tie-break:source-id"] };
}