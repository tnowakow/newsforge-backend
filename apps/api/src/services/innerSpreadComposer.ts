import type { Article, AssembledLayout, GridSpec, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import type { AssetDecisionRecord, AssetPlacementOutcome } from "@newsforge/shared/schemas";
import { LETTER_RENDER_CONTRACT } from "@newsforge/shared";
import { articleImageMatchesRef, classifyPorterSourceRole } from "./porterSourceSemantics.js";
import {
  chooseStoryModuleKind,
  colSpanToWidthPx,
  heightPxToRows,
  measureStoryModule,
  pageContentHeightPx,
  storyModuleFontVersion,
  storyModuleStyleVersion,
  type StoryModuleInput,
  type StoryModuleKind,
  type StoryModuleMeasurement,
} from "./storyModuleMeasurement.js";

/** R06 composition families searched over the two inner pages. */
export type InnerSpreadSkeleton =
  | "sparse-editorial"
  | "rail-two-story"
  | "medium-panel"
  | "wide-feature-supporting"
  | "long-copy-feature"
  | "dense-grid"
  | "photo-heavy"
  | "text-photo-mosaic";

export interface InnerSpreadContract {
  gridSpec: GridSpec;
  pageCount?: 2;
  bodyFontSizePt?: number;
  captionFontSizePt?: number;
  minBodyFontSizePt?: number;
  maxCandidates?: number;
  maxReflows?: number;
  /** Optional measure override (tests). Production uses Chromium measureStoryModule. */
  measure?: (input: StoryModuleInput) => Promise<StoryModuleMeasurement>;
  styleVersion?: string;
  fontVersion?: string;
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
  measuredClipIds: string[];
}

export interface OverflowReviewOption {
  id: string;
  label: string;
  detail: string;
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
  overflow?: {
    unitIds: string[];
    requiredExtraArea: number;
    reason: string;
    reviewOptions: OverflowReviewOption[];
  };
  provider: "deterministic";
  decisionTrace: string[];
  assetDecisions: AssetDecisionRecord[];
  /** True when Chromium/injected measure functions drove placement. */
  usedMeasurements: boolean;
  measurementCallCount: number;
}

type PlacementCursor = { page: number; row: number };

const SKELETONS: InnerSpreadSkeleton[] = [
  "sparse-editorial",
  "rail-two-story",
  "medium-panel",
  "wide-feature-supporting",
  "long-copy-feature",
  "dense-grid",
  "photo-heavy",
  "text-photo-mosaic",
];

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
  return raw
    .map((unit, index) => {
      const article = "article" in unit ? unit.article : unit;
      return {
        id: "id" in unit ? unit.id : article.id,
        article: { ...article },
        required: "required" in unit ? unit.required !== false : true,
        photoRefs: "photoRefs" in unit ? [...(unit.photoRefs ?? [])] : [...(article.imageRefs ?? [])],
      };
    })
    .sort(
      (a, b) =>
        (a.article.sourceOrder ?? 999) - (b.article.sourceOrder ?? 999) || a.id.localeCompare(b.id),
    );
}

function imageLinks(unit: InnerSpreadSourceUnit, images: NewsImage[]): NewsImage[] {
  const refs = unit.photoRefs ?? [];
  // Preserve ALL matched linked images — never silently take only the first two.
  const matched: NewsImage[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    for (const image of images) {
      if (seen.has(image.id)) continue;
      if (articleImageMatchesRef(image, unit.article, ref) || image.id === ref || image.originalName === ref) {
        matched.push(image);
        seen.add(image.id);
      }
    }
  }
  return matched;
}

/** Accepted images with no unit assignment — general gallery, must still be placed. */
function unassignedGalleryImages(units: InnerSpreadSourceUnit[], images: NewsImage[]): NewsImage[] {
  const linkedIds = new Set<string>();
  for (const unit of units) {
    for (const image of imageLinks(unit, images)) linkedIds.add(image.id);
  }
  return images.filter((image) => !linkedIds.has(image.id) && !image.isPlaceholder);
}

function skeletonColumns(
  kind: InnerSpreadSkeleton,
  index: number,
  grid: GridSpec,
  imageCount: number,
): { text: number; photos: number; stackPhotos: boolean; flowColumns: boolean } {
  const cols = grid.columns;
  switch (kind) {
    case "sparse-editorial":
    case "rail-two-story":
      if (index === 0 && imageCount > 0) {
        const text = Math.max(6, Math.floor(cols * 0.38));
        return { text, photos: cols - text, stackPhotos: false, flowColumns: false };
      }
      return {
        text: imageCount ? Math.max(8, Math.floor(cols * 0.55)) : cols,
        photos: imageCount ? cols - Math.max(8, Math.floor(cols * 0.55)) : 0,
        stackPhotos: imageCount > 2,
        flowColumns: false,
      };
    case "long-copy-feature":
      return {
        text: imageCount ? Math.max(10, Math.floor(cols * 0.62)) : cols,
        photos: imageCount ? cols - Math.max(10, Math.floor(cols * 0.62)) : 0,
        stackPhotos: true,
        flowColumns: true,
      };
    case "wide-feature-supporting":
    case "medium-panel":
      return {
        text: imageCount ? Math.max(8, Math.floor(cols * 0.58)) : cols,
        photos: imageCount ? cols - Math.max(8, Math.floor(cols * 0.58)) : 0,
        stackPhotos: imageCount > 1,
        flowColumns: false,
      };
    case "dense-grid":
      return {
        text: imageCount ? Math.max(7, Math.floor(cols * 0.48)) : cols,
        photos: imageCount ? cols - Math.max(7, Math.floor(cols * 0.48)) : 0,
        stackPhotos: true,
        flowColumns: false,
      };
    case "photo-heavy":
    case "text-photo-mosaic":
      return {
        text: imageCount ? Math.max(6, Math.floor(cols * 0.42)) : cols,
        photos: imageCount ? cols - Math.max(6, Math.floor(cols * 0.42)) : 0,
        stackPhotos: true,
        flowColumns: false,
      };
    default:
      return {
        text: imageCount ? Math.max(8, Math.floor(cols * 0.5)) : cols,
        photos: imageCount ? cols - Math.max(8, Math.floor(cols * 0.5)) : 0,
        stackPhotos: imageCount > 1,
        flowColumns: false,
      };
  }
}

function overlap(a: LayoutBlock, b: LayoutBlock): boolean {
  return (
    a.page === b.page &&
    a.position.col < b.position.col + b.position.colSpan &&
    b.position.col < a.position.col + a.position.colSpan &&
    a.position.row < b.position.row + b.position.rowSpan &&
    b.position.row < a.position.row + a.position.rowSpan
  );
}

function isShortList(unit: InnerSpreadSourceUnit): boolean {
  const role = classifyPorterSourceRole(unit.article);
  if (role !== "dated-list" && role !== "birthday-roster") return false;
  const rows = unit.article.body.split(/\n+|;\s*/).map((r) => r.trim()).filter(Boolean).length;
  return rows <= 4;
}

interface CandidateResult {
  layout: AssembledLayout;
  omitted: string[];
  pages: InnerSpreadPageDiagnostics[];
  trace: string[];
  measurementCallCount: number;
  unplacedGalleryIds: string[];
}

interface MeasureCtx {
  measure: (input: StoryModuleInput) => Promise<StoryModuleMeasurement>;
  styleVersion: string;
  fontVersion: string;
  bodyPt: number;
  minBodyPt: number;
  callCount: number;
}

async function measureUnit(
  ctx: MeasureCtx,
  unit: InnerSpreadSourceUnit,
  linked: NewsImage[],
  widthPx: number,
  kind: StoryModuleKind,
  flowColumns: boolean,
): Promise<StoryModuleMeasurement> {
  ctx.callCount += 1;
  return ctx.measure({
    kind: flowColumns && kind === "text-only" ? "long-text-columns" : kind,
    article: unit.article,
    images: linked,
    widthPx,
    styleVersion: ctx.styleVersion,
    fontVersion: ctx.fontVersion,
    bodyPt: Math.max(ctx.minBodyPt, ctx.bodyPt),
    columns: flowColumns ? 2 : 1,
    photoFrameHeightPx: linked.length ? Math.max(120, Math.round(widthPx * 0.35)) : undefined,
  });
}

async function placeCandidate(
  units: InnerSpreadSourceUnit[],
  images: NewsImage[],
  contract: InnerSpreadContract,
  skeleton: InnerSpreadSkeleton,
  ctx: MeasureCtx,
): Promise<CandidateResult> {
  const grid = contract.gridSpec;
  const blocks: LayoutBlock[] = [];
  const omitted: string[] = [];
  const measuredClipIds: string[] = [];
  const trace: string[] = [`skeleton:${skeleton}`, "measure:storyModule"];
  const cursor: PlacementCursor = { page: 1, row: 1 };
  let index = 0;

  const advance = (neededRows: number): boolean => {
    if (cursor.row + neededRows - 1 > grid.rowsPerPage) {
      cursor.page += 1;
      cursor.row = 1;
    }
    return cursor.page <= 2;
  };

  for (const unit of units) {
    const linked = imageLinks(unit, images);
    const widths = skeletonColumns(skeleton, index, grid, linked.length);
    const textWidth = linked.length ? widths.text : grid.columns;
    const textWidthPx = colSpanToWidthPx(textWidth, grid.columns);
    const kind = chooseStoryModuleKind(unit.article, linked.length);
    const measurement = await measureUnit(ctx, unit, linked, textWidthPx, kind, widths.flowColumns);

    // Convert measured height → rows. Cap short lists so we never emit a tall
    // single-row Brunch/Happy-Hour slab from a few lines of copy.
    let neededRows = heightPxToRows(measurement.intrinsicHeightPx, grid.rowsPerPage);
    if (isShortList(unit)) {
      neededRows = Math.min(neededRows, Math.max(2, Math.ceil(grid.rowsPerPage * 0.28)));
      trace.push(`compact-rail:${unit.id}:rows=${neededRows}`);
    }
    // Absorb some spare into photo stack when photos are present.
    if (linked.length > 0 && skeleton === "photo-heavy") {
      neededRows = Math.min(grid.rowsPerPage, Math.max(neededRows, Math.ceil(grid.rowsPerPage * 0.35)));
    }

    if (!advance(neededRows)) {
      if (unitRequired(unit)) omitted.push(unit.id);
      continue;
    }

    const page = cursor.page;
    const row = cursor.row;
    const role = classifyPorterSourceRole(unit.article);
    const textBlock: LayoutBlock = {
      blockId: `inner-${unit.id}`,
      slotId: `source-${unit.id}`,
      page,
      position: { col: 1, row, colSpan: textWidth, rowSpan: neededRows },
      kind: role === "dated-list" || role === "birthday-roster" ? "list" : "article",
      articleId: unit.article.id,
      heading: unit.article.title,
      sourceRole: role,
      sourceOrder: unit.article.sourceOrder ?? index,
      listItems: undefined,
      needsFiller: false,
      style: {
        compact: isShortList(unit),
        panelRole: role === "director-note" ? "directorCorner" : "featureBand",
      },
      compoundId: `inner-${unit.id}`,
      zIndex: 0,
    };
    blocks.push(textBlock);

    if (measurement.clipped) measuredClipIds.push(textBlock.blockId);

    // Place ALL linked photos for this unit (mosaic / stack when many).
    if (linked.length > 0) {
      const photoColStart = textWidth + 1;
      const photoColsAvail = Math.max(1, grid.columns - textWidth);
      if (widths.stackPhotos && linked.length > 1) {
        const rowsEach = Math.max(1, Math.floor(neededRows / linked.length));
        let photoRow = row;
        linked.forEach((image, imageIndex) => {
          const span =
            imageIndex === linked.length - 1
              ? row + neededRows - photoRow
              : Math.max(1, rowsEach);
          blocks.push({
            blockId: `inner-${unit.id}-photo-${image.id}`,
            slotId: `source-${image.id}`,
            page,
            position: {
              col: photoColStart,
              row: photoRow,
              colSpan: photoColsAvail,
              rowSpan: span,
            },
            kind: "image",
            imageId: image.id,
            caption: image.caption,
            sourceRole: role,
            sourceOrder: unit.article.sourceOrder ?? index,
            needsFiller: false,
            style: { photoTreatment: "collage", panelRole: "photoCluster" },
            compoundId: `inner-${unit.id}`,
            zIndex: 0,
          });
          photoRow += span;
        });
      } else {
        const per = Math.max(1, Math.floor(photoColsAvail / linked.length));
        linked.forEach((image, imageIndex) => {
          const col = photoColStart + imageIndex * per;
          const colSpan =
            imageIndex === linked.length - 1
              ? grid.columns - col + 1
              : Math.min(per, grid.columns - col + 1);
          if (colSpan <= 0) return;
          blocks.push({
            blockId: `inner-${unit.id}-photo-${image.id}`,
            slotId: `source-${image.id}`,
            page,
            position: { col, row, colSpan, rowSpan: neededRows },
            kind: "image",
            imageId: image.id,
            caption: image.caption,
            sourceRole: role,
            sourceOrder: unit.article.sourceOrder ?? index,
            needsFiller: false,
            style: { photoTreatment: "collage", panelRole: "photoCluster" },
            compoundId: `inner-${unit.id}`,
            zIndex: 0,
          });
        });
      }
    }

    // Detect allocated height shorter than measured content → clip.
    const allocatedPx =
      (pageContentRowPx(grid.rowsPerPage) * neededRows);
    if (measurement.contentHeightPx > allocatedPx + 2) {
      measuredClipIds.push(textBlock.blockId);
    }

    cursor.row += neededRows;
    index += 1;
  }

  // Place unassigned general-gallery images — never drop them silently.
  const gallery = unassignedGalleryImages(units, images);
  const unplacedGalleryIds: string[] = [];
  for (const image of gallery) {
    const spanRows = Math.max(3, Math.ceil(grid.rowsPerPage * 0.22));
    const spanCols = Math.max(4, Math.ceil(grid.columns * 0.28));
    if (!advance(spanRows)) {
      unplacedGalleryIds.push(image.id);
      continue;
    }
    // Prefer remaining columns on the current row band; else full-width band.
    const col = 1;
    blocks.push({
      blockId: `inner-gallery-${image.id}`,
      slotId: `gallery-${image.id}`,
      page: cursor.page,
      position: { col, row: cursor.row, colSpan: Math.min(spanCols, grid.columns), rowSpan: spanRows },
      kind: "image",
      imageId: image.id,
      caption: image.caption,
      sourceRole: "narrative-story",
      sourceOrder: 900,
      needsFiller: false,
      style: { photoTreatment: "wide", panelRole: "photoCluster" },
      compoundId: `gallery-${image.id}`,
      zIndex: 0,
    });
    cursor.row += spanRows;
    trace.push(`gallery-placed:${image.id}`);
  }

  // No photo-only page when meaningful copy remains unplaced — already handled
  // by required unit omission. Soft check: if a page has only images and omitted
  // text units exist, mark overflow via omitted list.

  const pages: InnerSpreadPageDiagnostics[] = [1, 2].map((p) => {
    const pageBlocks = blocks.filter((b) => b.page === p);
    let overlapCount = 0;
    for (let i = 0; i < pageBlocks.length; i += 1) {
      for (let j = i + 1; j < pageBlocks.length; j += 1) {
        if (overlap(pageBlocks[i], pageBlocks[j])) overlapCount += 1;
      }
    }
    const usedArea = pageBlocks.reduce((n, b) => n + b.position.colSpan * b.position.rowSpan, 0);
    const pageClips = measuredClipIds.filter((id) => pageBlocks.some((b) => b.blockId === id));
    return {
      page: p,
      clipCount: pageClips.length,
      overlapCount,
      usedArea,
      contentArea: grid.columns * grid.rowsPerPage,
      measuredClipIds: pageClips,
    };
  });

  // Guard: photo-only page while copy units were omitted → prefer overflow.
  for (const page of pages) {
    const pageBlocks = blocks.filter((b) => b.page === page.page);
    const hasCopy = pageBlocks.some((b) => b.articleId);
    const hasPhoto = pageBlocks.some((b) => b.imageId);
    if (hasPhoto && !hasCopy && omitted.length > 0) {
      trace.push(`photo-only-page:${page.page}:blocked`);
      page.clipCount = Math.max(page.clipCount, 1);
    }
  }

  const layout: AssembledLayout = {
    templateId: "inner-spread-composer",
    layoutMode: "campus-inner-spread",
    logicalPageOffset: 1,
    pageCount: 2,
    blocks,
    unfilledSlotIds: [],
    stats: {
      placedArticles: blocks.filter((b) => b.articleId).length,
      placedImages: blocks.filter((b) => b.imageId).length,
      fillerBlocks: 0,
      emptySlots: 0,
    },
    version: 1,
  };
  return {
    layout,
    omitted,
    pages,
    trace,
    measurementCallCount: ctx.callCount,
    unplacedGalleryIds,
  };
}

function pageContentRowPx(rowsPerPage: number): number {
  const contentH = pageContentHeightPx(LETTER_RENDER_CONTRACT);
  const gapPx = 4;
  const usable = Math.max(1, contentH - gapPx * Math.max(0, rowsPerPage - 1));
  return usable / rowsPerPage;
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
  const { units, images, best } = input;
  const decisions: AssetDecisionRecord[] = [];
  const placedUnitIds = new Set(
    best.layout.blocks
      .filter((block) => block.articleId || block.slotId?.startsWith("source-"))
      .map((block) => block.articleId ?? block.slotId.replace(/^source-/, "")),
  );
  const placedImageIds = new Set(
    best.layout.blocks.filter((block) => block.imageId).map((block) => block.imageId as string),
  );
  const pageByUnit = new Map<string, number>();
  for (const block of best.layout.blocks) {
    const unitId = block.articleId ?? block.slotId.replace(/^source-/, "");
    if (!pageByUnit.has(unitId)) pageByUnit.set(unitId, block.page + 1);
  }

  for (const unit of units) {
    const required = unitRequired(unit);
    const kind = unitKind(unit);
    if (placedUnitIds.has(unit.id)) {
      decisions.push({
        assetId: unit.id,
        unitId: unit.id,
        kind,
        outcome: "placed" as AssetPlacementOutcome,
        page: pageByUnit.get(unit.id),
        required,
        decisionCode: "inner-alloc",
      });
    } else if (best.omitted.includes(unit.id)) {
      decisions.push({
        assetId: unit.id,
        unitId: unit.id,
        kind,
        outcome: "rejected",
        required,
        reason:
          "exceeds two inner-page capacity at approved type floor: unit did not fit on pages 2–3 in any skeleton candidate",
        decisionCode: "inner-spread-overflow",
      });
    } else {
      decisions.push({
        assetId: unit.id,
        unitId: unit.id,
        kind,
        outcome: "rejected",
        required,
        reason: "no non-overlapping slot remained on inner pages 2–3",
        decisionCode: "inner-slot-exhausted",
      });
    }
    const refs = unit.photoRefs ?? [];
    for (const ref of refs) {
      const matched = images.find(
        (image) =>
          articleImageMatchesRef(image, unit.article, ref) ||
          image.id === ref ||
          image.originalName === ref,
      );
      if (matched && placedImageIds.has(matched.id)) {
        decisions.push({
          assetId: matched.id,
          unitId: unit.id,
          kind: "photo",
          outcome: "placed" as AssetPlacementOutcome,
          page: pageByUnit.get(unit.id),
          required,
          decisionCode: "inner-alloc-photo",
        });
      } else if (!matched) {
        decisions.push({
          assetId: ref,
          unitId: unit.id,
          kind: "photo",
          outcome: "rejected" as AssetPlacementOutcome,
          required,
          reason: "required photo reference is unresolved: no uploaded image matches the reference",
          decisionCode: "unresolved-photo-ref",
        });
      } else {
        decisions.push({
          assetId: matched.id,
          unitId: unit.id,
          kind: "photo",
          outcome: "rejected" as AssetPlacementOutcome,
          required,
          reason: "resolved image was not placed within the two inner pages",
          decisionCode: "photo-not-placed",
        });
      }
    }
  }

  // Gallery (unassigned) photos.
  for (const image of unassignedGalleryImages(units, images)) {
    if (placedImageIds.has(image.id)) {
      decisions.push({
        assetId: image.id,
        kind: "photo",
        outcome: "placed",
        required: true,
        decisionCode: "inner-gallery-photo",
      });
    } else {
      decisions.push({
        assetId: image.id,
        kind: "photo",
        outcome: "rejected",
        required: true,
        reason: "unassigned general-gallery image did not fit on pages 2–3",
        decisionCode: "gallery-not-placed",
      });
    }
  }

  const seen = new Set<string>();
  return decisions
    .filter((decision) => {
      const key = `${decision.assetId}\u0000${decision.unitId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        a.assetId.localeCompare(b.assetId) || (a.unitId ?? "").localeCompare(b.unitId ?? ""),
    );
}

function overflowReviewOptions(omitted: string[], galleryMiss: string[]): OverflowReviewOption[] {
  return [
    {
      id: "split-long-story",
      label: "Allow long stories to continue across both inner pages",
      detail: `Re-flow omitted units (${omitted.join(", ") || "none"}) with explicit continuation markers.`,
    },
    {
      id: "drop-optional-gallery",
      label: "Park unassigned gallery photos for operator review",
      detail: galleryMiss.length
        ? `Gallery ids pending: ${galleryMiss.join(", ")}`
        : "No gallery overflow.",
    },
    {
      id: "operator-edit",
      label: "Open overflow review — never silent trim or type squeeze",
      detail: "Keep approved type floor; operator chooses cuts or extra page.",
    },
  ];
}

export async function composeInnerSpread(input: InnerSpreadComposeInput): Promise<InnerSpreadComposeResult> {
  const contract = input.contract;
  const units = unitsFrom(input.source);
  const unresolvedRequiredPhotoRefs = units.flatMap((unit) =>
    unitRequired(unit)
      ? (unit.photoRefs ?? []).filter(
          (ref) =>
            !input.images.some(
              (image) =>
                articleImageMatchesRef(image, unit.article, ref) ||
                image.id === ref ||
                image.originalName === ref,
            ),
        )
      : [],
  );

  const bodyFloor = contract.minBodyFontSizePt ?? LETTER_RENDER_CONTRACT.type.bodyPt;
  const bodyPt = Math.max(bodyFloor, contract.bodyFontSizePt ?? LETTER_RENDER_CONTRACT.type.bodyPt);
  // Never squeeze below the approved type floor.
  if ((contract.bodyFontSizePt ?? bodyPt) < bodyFloor) {
    throw new Error(`body font ${contract.bodyFontSizePt}pt is below approved floor ${bodyFloor}pt`);
  }

  const ctx: MeasureCtx = {
    measure: contract.measure ?? measureStoryModule,
    styleVersion: contract.styleVersion ?? storyModuleStyleVersion(LETTER_RENDER_CONTRACT),
    fontVersion: contract.fontVersion ?? storyModuleFontVersion(LETTER_RENDER_CONTRACT),
    bodyPt,
    minBodyPt: bodyFloor,
    callCount: 0,
  };

  const maxCandidates = Math.min(SKELETONS.length, Math.max(1, contract.maxCandidates ?? SKELETONS.length));
  let best: CandidateResult | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestSkeleton: InnerSpreadSkeleton = SKELETONS[0];
  let totalMeasurementCalls = 0;

  for (const skeleton of SKELETONS.slice(0, maxCandidates)) {
    ctx.callCount = 0;
    const candidate = await placeCandidate(units, input.images, contract, skeleton, ctx);
    totalMeasurementCalls += candidate.measurementCallCount;
    const invalid =
      candidate.omitted.length > 0 ||
      candidate.unplacedGalleryIds.length > 0 ||
      candidate.pages.some((p) => p.overlapCount || p.clipCount);
    // Prefer fit, then fewer omissions, then lower wasted area, then fewer clips.
    const waste = candidate.pages.reduce((n, p) => n + (p.contentArea - p.usedArea) ** 2, 0);
    const clips = candidate.pages.reduce((n, p) => n + p.clipCount, 0);
    const score =
      (invalid ? 1_000_000 : 0) +
      candidate.omitted.length * 50_000 +
      candidate.unplacedGalleryIds.length * 20_000 +
      clips * 5_000 +
      waste;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      bestSkeleton = skeleton;
    }
  }

  if (!best) throw new Error("inner spread produced no candidate");

  const requiredExtraArea = best.omitted.reduce((n, id) => {
    const unit = units.find((u) => u.id === id);
    if (!unit) return n;
    // Conservative extra-area estimate from word volume when unit never measured in best.
    const words =
      unit.article.wordCount || unit.article.body.trim().split(/\s+/).filter(Boolean).length;
    return n + Math.max(contract.gridSpec.columns * 2, Math.ceil(words / 8));
  }, 0);

  const status =
    best.omitted.length ||
    best.unplacedGalleryIds.length ||
    unresolvedRequiredPhotoRefs.length ||
    best.pages.some((p) => p.overlapCount || p.clipCount)
      ? "overflow"
      : "fit";

  const assetDecisions = buildInnerAssetDecisions({
    units,
    images: input.images,
    best,
    unresolvedRequiredPhotoRefs,
    contract,
  });
  const layout: AssembledLayout = { ...best.layout, assetDecisions };

  const reviewOptions = overflowReviewOptions(best.omitted, best.unplacedGalleryIds);
  const reason = unresolvedRequiredPhotoRefs.length
    ? "required photo references are unresolved"
    : best.pages.some((p) => p.clipCount)
      ? "measured content clips at approved type floor"
      : best.unplacedGalleryIds.length
        ? "unassigned gallery images exceed two-page capacity"
        : "required source units exceed two-page capacity at approved type floor";

  return {
    status,
    layout,
    omittedRequiredUnitIds: best.omitted,
    unresolvedRequiredPhotoRefs,
    contentEdits: [],
    pages: best.pages,
    skeleton: bestSkeleton,
    candidateCount: Math.min(SKELETONS.length, maxCandidates),
    reflowCount: 0,
    ...(status === "overflow"
      ? {
          overflow: {
            unitIds: [...best.omitted, ...best.unplacedGalleryIds],
            requiredExtraArea,
            reason,
            reviewOptions,
          },
        }
      : {}),
    provider: "deterministic",
    decisionTrace: [
      ...best.trace,
      `measurements:calls=${totalMeasurementCalls}`,
      "feasibility-before-density",
      "type-floor:preserved",
      "all-linked-photos:retained",
      "gallery-images:considered",
      "tie-break:source-id",
      "per-asset-decisions:recorded",
    ],
    assetDecisions,
    usedMeasurements: totalMeasurementCalls > 0,
    measurementCallCount: totalMeasurementCalls,
  };
}
