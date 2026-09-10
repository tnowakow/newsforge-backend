import type { Article, AssembledLayout, GridSpec, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import type { AssetDecisionRecord, AssetPlacementOutcome } from "@newsforge/shared/schemas";
import { articleImageMatchesRef, classifyPorterSourceRole } from "./porterSourceSemantics.js";

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
  /**
   * TRI-R04 item 4 — per-asset placement decisions, traceable to the shared
   * source/asset contract. Every unit and every required photo ref either
   * lands on an inner page (outcome "placed", with the logical page) or
   * carries a recorded rejection reason (outcome "rejected").
   */
  assetDecisions: AssetDecisionRecord[];
}

type Placement = { page: number; col: number; row: number; colSpan: number; rowSpan: number };

const SKELETONS: InnerSpreadSkeleton[] = ["rail-two-story", "wide-feature-supporting", "text-photo-mosaic"];

/**
 * TRI-R04 item 4 — a brief is NOT automatically outer content. Inner
 * allocation treats every accepted source unit (briefs included) as
 * required for pages 2–3; a brief that does not fit is rejected with a
 * recorded reason, never silently promoted to outer or dropped.
 */
function unitRequired(unit: InnerSpreadSourceUnit): boolean {
  return unit.required !== false;
}

function unitKind(unit: InnerSpreadSourceUnit): AssetDecisionRecord["kind"] {
  const role = classifyPorterSourceRole(unit.article);
  if (role === "birthday-roster") return "roster";
  if (role === "dated-list") return "schedule";
  if (role === "brief") return "article";
  return "article";
}

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
  return images.filter((image) => refs.some((ref) => articleImageMatchesRef(image, unit.article, ref)));
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

interface CandidateResult {
  layout: AssembledLayout;
  omitted: string[];
  pages: InnerSpreadPageDiagnostics[];
  trace: string[];
}

function placeCandidate(units: InnerSpreadSourceUnit[], images: NewsImage[], contract: InnerSpreadContract, skeleton: InnerSpreadSkeleton): CandidateResult {
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
    if (page > 2) { if (unitRequired(unit)) omitted.push(unit.id); continue; }
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

/**
 * TRI-R04 item 4 — build per-asset decision records from the composed
 * result. Every accepted unit and every required photo ref is accounted
 * for: placed (with its logical page) or rejected with a stored reason.
 */
export function buildInnerAssetDecisions(input: {
  units: InnerSpreadSourceUnit[];
  images: NewsImage[];
  best: CandidateResult;
  unresolvedRequiredPhotoRefs: string[];
  contract: InnerSpreadContract;
}): AssetDecisionRecord[] {
  const { units, images, best, unresolvedRequiredPhotoRefs, contract } = input;
  const decisions: AssetDecisionRecord[] = [];
  const placedUnitIds = new Set(
    best.layout.blocks
      .filter((block) => block.articleId || block.slotId?.startsWith("source-"))
      .map((block) => block.articleId ?? block.slotId.replace(/^source-/, "")),
  );
  const placedImageIds = new Set(best.layout.blocks.filter((block) => block.imageId).map((block) => block.imageId));
  const pageByUnit = new Map<string, number>();
  for (const block of best.layout.blocks) {
    const unitId = block.articleId ?? block.slotId.replace(/^source-/, "");
    if (!pageByUnit.has(unitId)) pageByUnit.set(unitId, block.page + 1);
  }

  for (const unit of units) {
    const required = unitRequired(unit);
    const kind = unitKind(unit);
    if (placedUnitIds.has(unit.id)) {
      decisions.push({ assetId: unit.id, unitId: unit.id, kind, outcome: "placed" as AssetPlacementOutcome, page: pageByUnit.get(unit.id), required, decisionCode: "inner-alloc" });
    } else if (best.omitted.includes(unit.id)) {
      decisions.push({ assetId: unit.id, unitId: unit.id, kind, outcome: "rejected", required, reason: "exceeds two inner-page capacity: unit did not fit on pages 2\u20133 in any skeleton candidate", decisionCode: "inner-spread-overflow" });
    } else {
      decisions.push({ assetId: unit.id, unitId: unit.id, kind, outcome: "rejected", required, reason: "no non-overlapping slot remained on inner pages 2\u20133", decisionCode: "inner-slot-exhausted" });
    }
    // Per-photo decisions for this unit's refs.
    const refs = unit.photoRefs ?? [];
    for (const ref of refs) {
      const matched = images.find((image) => articleImageMatchesRef(image, unit.article, ref));
      if (matched && placedImageIds.has(matched.id)) {
        decisions.push({ assetId: matched.id, unitId: unit.id, kind: "photo", outcome: "placed" as AssetPlacementOutcome, page: pageByUnit.get(unit.id), required, decisionCode: "inner-alloc-photo" });
      } else if (!matched) {
        decisions.push({ assetId: ref, unitId: unit.id, kind: "photo", outcome: "rejected" as AssetPlacementOutcome, required, reason: "required photo reference is unresolved: no uploaded image matches the reference", decisionCode: "unresolved-photo-ref" });
      } else {
        decisions.push({ assetId: matched.id, unitId: unit.id, kind: "photo", outcome: "rejected" as AssetPlacementOutcome, required, reason: "resolved image was not placed within the two inner pages", decisionCode: "photo-not-placed" });
      }
    }
  }
  // Keep decisions deterministic and de-duplicated by (assetId, unitId).
  const seen = new Set<string>();
  return decisions.filter((decision) => {
    const key = `${decision.assetId}\u0000${decision.unitId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.assetId.localeCompare(b.assetId) || (a.unitId ?? "").localeCompare(b.unitId ?? ""));
}

export async function composeInnerSpread(input: InnerSpreadComposeInput): Promise<InnerSpreadComposeResult> {
  const contract = input.contract;
  const units = unitsFrom(input.source);
  const unresolvedRequiredPhotoRefs = units.flatMap((unit) => (unitRequired(unit) ? (unit.photoRefs ?? []).filter((ref) => !input.images.some((image) => articleImageMatchesRef(image, unit.article, ref))) : []));
  const maxCandidates = Math.min(12, Math.max(1, contract.maxCandidates ?? 12));
  let best: CandidateResult | undefined;
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
  const assetDecisions = buildInnerAssetDecisions({ units, images: input.images, best, unresolvedRequiredPhotoRefs, contract });
  const layout: AssembledLayout = { ...best.layout, assetDecisions };
  return { status, layout, omittedRequiredUnitIds: best.omitted, unresolvedRequiredPhotoRefs, contentEdits: [], pages: best.pages, skeleton: SKELETONS.find((s) => best?.trace.includes(`skeleton:${s}`)) ?? "text-photo-mosaic", candidateCount: Math.min(SKELETONS.length, maxCandidates), reflowCount: 0, ...(status === "overflow" ? { overflow: { unitIds: best.omitted, requiredExtraArea, reason: unresolvedRequiredPhotoRefs.length ? "required photo references are unresolved" : "required source units exceed two-page capacity" } } : {}), provider: "deterministic", decisionTrace: [...best.trace, "feasibility-before-density", "tie-break:source-id", "per-asset-decisions:recorded"], assetDecisions };
}
