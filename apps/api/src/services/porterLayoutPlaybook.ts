import type {
  Article,
  AssembledLayout,
  GridSpec,
  LayoutBlock,
  NewsImage,
  PorterLayoutPlaybookReport,
  PorterLayoutRuleResult,
} from "@newsforge/shared/schemas";
import type { CandidateMeasurement } from "./adaptiveLayoutPlanner.js";
import { evaluatePorterLayoutInvariants } from "./porterLayoutInvariants.js";
import {
  isPorterScheduleArticle,
  normalizePorterText,
  porterBlocksAreAdjacent,
  porterImageMatchesRef,
} from "./porterSourceSemantics.js";

export const PORTER_LAYOUT_PLAYBOOK_PROMPT = `PORTER LAYOUT DIRECTOR RULES:
- Classify content before placing it: birthday, Executive Director note, dated schedule, resident/legacy story, photo-paired story, short brief, and footer/info module.
- Put the signature rail first. Real birthday rosters, when present on the inner spread, belong in the upper-left page-2 rail unless a stronger Porter family rail is already there. If birthdays are absent, leave only a client-fill placeholder and do not invent names, dates, or celebration copy.
- Executive Director belongs in a stable top/left anchor zone with a cream panel and navy heading; do not bury it in a small random brief.
- Happy Hour, Upcoming Events, Brunch, and outing/social schedules are narrow rails or compact two-column lists. Do not make short dated lists wide horizontal slabs.
- Keep every uploaded photo referenced by a story next to that story, preferably same page and touching or near the story block.
- If a page has white space or low utility, repair in this order: grow an adjacent referenced photo, then shrink/merge the short text box, then move the short list into a rail.
- Every dense-lavender page needs a visible anchor: vertical rail, stacked photo strip, footer band, or strong photo mosaic.
- For dense-lavender-grid, choose and obey a concrete page map: schedule rail, Executive Director anchor, story/photo pair tiles, short-brief stack, and vertical/photo-strip anchor.
- Avoid repeated same-width text boxes stacked in rows. Dense Porter spreads need varied module widths and staggered rhythm.
- Use all real uploaded photos exactly once when supplied; never let filename captions replace human story captions.
- Reject technically valid layouts that fail these rules, even if they have no clipping or overflow.`;

type RuleStatus = PorterLayoutRuleResult["status"];

interface EvaluateInput {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  gridSpec: GridSpec;
  referenceFamily?: string;
  measurement?: CandidateMeasurement;
}

function normalize(value: string | undefined): string {
  return normalizePorterText(value);
}

function imageMatchesRef(image: NewsImage, ref: string): boolean {
  return porterImageMatchesRef(image, ref);
}

function blockArea(block: LayoutBlock): number {
  return block.position.colSpan * block.position.rowSpan;
}

function touchesOrNear(a: LayoutBlock, b: LayoutBlock): boolean {
  return porterBlocksAreAdjacent(a, b);
}

function isScheduleArticle(article: Article): boolean {
  return isPorterScheduleArticle(article);
}

function isBirthdayBlock(block: LayoutBlock): boolean {
  const text = `${block.heading ?? ""} ${block.inlineText ?? ""} ${block.slotId}`;
  const isPlaceholder = !block.articleId && /placeholder|client-fill|client fill/i.test(text);
  return !isPlaceholder && (block.style?.panelRole === "birthday" || /birthday/i.test(text));
}

function isScheduleBlock(block: LayoutBlock): boolean {
  return (
    block.style?.panelRole === "happyHour" ||
    block.style?.panelRole === "upcomingEvents" ||
    block.style?.panelRole === "outingList" ||
    (block.kind === "list" && /happy|event|outing|social|brunch/i.test(`${block.heading ?? ""} ${block.slotId}`))
  );
}

function articleTitle(articleId: string | undefined, articles: Article[]): string {
  return articles.find((article) => article.id === articleId)?.title ?? "";
}

function isFilenameCaption(caption: string | undefined): boolean {
  return Boolean(caption && /\.(jpe?g|png|gif|webp|heic|heif|tiff?)$/i.test(caption.trim()));
}

function rule(
  id: string,
  label: string,
  status: RuleStatus,
  score: number,
  target: string,
  result: string,
): PorterLayoutRuleResult {
  return { id, label, status, score: Math.max(0, Math.min(1, score)), target, result };
}

function statusFromRatio(ratio: number, warnAt = 0.8): RuleStatus {
  if (ratio >= 0.999) return "pass";
  if (ratio >= warnAt) return "warn";
  return "fail";
}

export function evaluatePorterLayoutPlaybook(input: EvaluateInput): PorterLayoutPlaybookReport {
  const { layout, articles, images, gridSpec, measurement } = input;
  const narrowRailMax = Math.max(6, Math.floor(gridSpec.columns / 4));
  const playbookPageCount = layout.pageCount >= 4 ? 2 : layout.pageCount;
  const firstInnerPage = layout.pageCount >= 4 ? 2 : 1;
  const lastInnerPage = layout.pageCount >= 4 ? 3 : layout.pageCount;
  const innerBlocks = layout.blocks
    .filter((block) =>
      layout.pageCount >= 4
        ? block.page === 2 || block.page === 3
        : block.page <= layout.pageCount,
    )
    .map((block) => layout.pageCount >= 4 ? { ...block, page: block.page - 1 } : block)
    .filter((block) => block.kind !== "empty");
  const articleBlocks = innerBlocks.filter((block) => block.articleId);
  const imageBlocks = innerBlocks.filter((block) => block.imageId);
  const rules: PorterLayoutRuleResult[] = [];
  const invariantReport = evaluatePorterLayoutInvariants({ layout, articles, images, measurement });
  rules.push(rule(
    "hard-source-invariants",
    "Hard source invariants",
    invariantReport.passed ? "pass" : "fail",
    invariantReport.passed ? 1 : 0,
    "Required source units, rows, real images, non-photo-only pages, and explicit story/photo compounds cannot fail.",
    invariantReport.passed
      ? "No hard Porter source invariant failures."
      : invariantReport.hardFailures.slice(0, 3).join(" · "),
  ));

  const birthdayBlocks = innerBlocks.filter(isBirthdayBlock);
  if (birthdayBlocks.length === 0) {
    rules.push(rule(
      "signature-rail",
      "Signature birthday/rail anchor",
      "not-applicable",
      1,
      "When birthdays appear on the inner spread, place the birthday rail in the upper-left page-2 zone.",
      "No inner-spread birthday block was present in this packet.",
    ));
  } else {
    const anchored = birthdayBlocks.some((block) => block.page === 1 && block.position.col <= 3 && block.position.row <= 3 && block.position.colSpan <= 8);
    rules.push(rule(
      "signature-rail",
      "Signature birthday/rail anchor",
      anchored ? "pass" : "fail",
      anchored ? 1 : 0,
      "Birthday rail upper-left on the first inner page unless another Porter rail owns that zone.",
      anchored ? "Birthday rail is anchored in the upper-left zone." : "Birthday content is present but not anchored in the expected rail zone.",
    ));
  }

  const directorArticle = articles.find((article) => /executive director|director corner/i.test(article.title));
  const directorBlock = articleBlocks.find((block) => block.articleId === directorArticle?.id);
  if (directorArticle && directorBlock) {
    const anchored = directorBlock.page === 1 && directorBlock.position.row <= 3 && directorBlock.position.col <= 14 && blockArea(directorBlock) >= 35;
    rules.push(rule(
      "director-anchor",
      "Executive Director anchor",
      anchored ? "pass" : "warn",
      anchored ? 1 : 0.55,
      "Executive Director should hold a stable top/left cream-panel anchor.",
      anchored
        ? `Placed page ${directorBlock.page}, col ${directorBlock.position.col}, row ${directorBlock.position.row}, area ${blockArea(directorBlock)}.`
        : `Placed page ${directorBlock.page}, col ${directorBlock.position.col}, row ${directorBlock.position.row}, area ${blockArea(directorBlock)}; anchor is weak.`,
    ));
  }

  const scheduleArticles = articles.filter(isScheduleArticle);
  const scheduleBlocks = innerBlocks.filter(isScheduleBlock);
  let scheduleRailRatio = 1;
  if (scheduleArticles.length > 0 || scheduleBlocks.length > 0) {
    const compact = scheduleBlocks.filter((block) => block.position.colSpan <= narrowRailMax || (block.position.colSpan <= 10 && (block.listItems?.length ?? 0) >= 5));
    const ratio = scheduleBlocks.length ? compact.length / scheduleBlocks.length : 0;
    scheduleRailRatio = ratio;
    rules.push(rule(
      "schedule-rails",
      "Dated lists stay narrow",
      statusFromRatio(ratio),
      ratio,
      "Happy Hour, Upcoming Events, Brunch, socials, and outings use narrow rails or compact two-column lists.",
      `${compact.length}/${scheduleBlocks.length} schedule blocks were compact rails/lists.`,
    ));
  }

  const referencedArticles = articles.filter((article) => (article.imageRefs?.length ?? 0) > 0);
  let photoStoryRatio = 1;
  if (referencedArticles.length > 0) {
    let paired = 0;
    const details: string[] = [];
    for (const article of referencedArticles) {
      const textBlock = articleBlocks.find((block) => block.articleId === article.id);
      const matchedImageIds = images
        .filter((image) => (article.imageRefs ?? []).some((ref) => imageMatchesRef(image, ref)))
        .map((image) => image.id);
      const matchingImageBlocks = innerBlocks.filter((block) => block.imageId && matchedImageIds.includes(block.imageId));
      const near = Boolean(textBlock && matchingImageBlocks.some((imageBlock) => touchesOrNear(textBlock, imageBlock)));
      if (near) paired += 1;
      details.push(`${article.title}: ${near ? "adjacent" : matchedImageIds.length === 0 ? "unresolved" : "drifted"}`);
    }
    const ratio = paired / referencedArticles.length;
    photoStoryRatio = ratio;
    rules.push(rule(
      "photo-story-pairing",
      "Referenced photos stay with stories",
      statusFromRatio(ratio),
      ratio,
      "Every DOCX-referenced photo should be on the same page and near its story.",
      `${paired}/${referencedArticles.length} referenced story/photo pairs were near. ${details.slice(0, 4).join("; ")}${details.length > 4 ? "…" : ""}`,
    ));
  }

  if (/dense-lavender-grid/i.test(input.referenceFamily ?? "")) {
    const hasDirectorAnchor = Boolean(directorBlock && directorBlock.page === 1 && directorBlock.position.row <= 3 && directorBlock.position.col <= 14);
    const hasVerticalRail = imageBlocks.some((block) => block.position.colSpan <= narrowRailMax && block.position.rowSpan >= Math.ceil(gridSpec.rowsPerPage * 0.35));
    const hasPhotoStrip = [1, 2].some((page) => imageBlocks.filter((block) => block.page === page).length >= 3);
    const hasBriefStack = articleBlocks.filter((block) => blockArea(block) <= 36).length >= 3 || scheduleBlocks.length >= 2;
    const mapScore = [hasDirectorAnchor, scheduleRailRatio >= 0.8, photoStoryRatio >= 0.8, hasVerticalRail || hasPhotoStrip, hasBriefStack]
      .filter(Boolean).length / 5;
    rules.push(rule(
      "dense-lavender-map",
      "Dense-lavender map skeleton",
      statusFromRatio(mapScore, 0.8),
      mapScore,
      "Dense-lavender output should follow a concrete map: schedule rail, ED anchor, story/photo tiles, brief stack, and photo rail/strip.",
      `${Math.round(mapScore * 5)}/5 skeleton traits present: ED anchor ${hasDirectorAnchor ? "yes" : "no"}, schedule rail ${scheduleRailRatio >= 0.8 ? "yes" : "no"}, photo/story tiles ${photoStoryRatio >= 0.8 ? "yes" : "no"}, photo anchor ${hasVerticalRail || hasPhotoStrip ? "yes" : "no"}, brief stack ${hasBriefStack ? "yes" : "no"}.`,
    ));
  }

  const usedUploadedImages = images.filter((image) => image.source === "UPLOAD" || images.length > 0);
  const imageUseRatio = usedUploadedImages.length ? imageBlocks.length / usedUploadedImages.length : 1;
  const filenameCaptions = imageBlocks.filter((block) => isFilenameCaption(block.caption)).length;
  const suppliedPlaceholderImages = usedUploadedImages.filter((image) => image.isPlaceholder).length;
  const measuredPlaceholderImages = measurement?.placeholderImages ?? 0;
  const placeholderImages = Math.max(suppliedPlaceholderImages, measuredPlaceholderImages);
  const realRenderedImages = measurement?.realRenderedImages ?? Math.max(0, imageBlocks.length - placeholderImages);
  rules.push(rule(
    "photo-use-captions",
    "Real photos and human captions",
    placeholderImages > 0 ? "fail" : imageUseRatio >= 1 && filenameCaptions === 0 ? "pass" : imageUseRatio >= 0.85 && filenameCaptions <= 1 ? "warn" : "fail",
    Math.min(1, imageUseRatio) * (filenameCaptions === 0 ? 1 : 0.75) * (placeholderImages === 0 ? 1 : 0.35),
    "Use all supplied real photos once, avoid filename captions, and reject rendered placeholder/test images.",
    `${imageBlocks.length}/${usedUploadedImages.length} supplied photos placed; ${realRenderedImages}/${imageBlocks.length} rendered as real photos; ${placeholderImages} placeholder/test images; ${filenameCaptions} filename-like captions.`,
  ));

  const pageCount = Math.max(playbookPageCount, 1);
  let anchoredPages = 0;
  const pageDetails: string[] = [];
  for (let page = 1; page <= pageCount; page++) {
    const pageBlocks = innerBlocks.filter((block) => block.page === page);
    const hasAnchor = pageBlocks.some((block) =>
      (block.imageId && (block.position.rowSpan >= 6 || block.position.colSpan >= Math.floor(gridSpec.columns * 0.42))) ||
      (isScheduleBlock(block) && block.position.colSpan <= narrowRailMax && block.position.rowSpan >= 4) ||
      block.style?.panelRole === "photoCluster" ||
      block.style?.panelRole === "spotlightRail",
    );
    if (hasAnchor) anchoredPages += 1;
    pageDetails.push(`p${page}:${hasAnchor ? "anchor" : "none"}`);
  }
  const anchorRatio = anchoredPages / pageCount;
  rules.push(rule(
    "page-anchors",
    "Every page has a Porter anchor",
    statusFromRatio(anchorRatio),
    anchorRatio,
    "Each inner page needs a visible rail, photo strip, footer band, or mosaic anchor.",
    `${anchoredPages}/${pageCount} pages have an anchor (${pageDetails.join(", ")}).`,
  ));

  const photoOnlyPages = Array.from({ length: pageCount }, (_, index) => index + 1).filter((page) => {
    const pageBlocks = innerBlocks.filter((block) => block.page === page);
    return pageBlocks.some((block) => block.imageId) &&
      !pageBlocks.some((block) => block.articleId || block.kind === "list");
  });
  rules.push(rule(
    "no-photo-only-pages",
    "No photo-only inner pages",
    photoOnlyPages.length === 0 ? "pass" : "fail",
    photoOnlyPages.length === 0 ? 1 : 0,
    "A Porter inner spread should not dedicate a whole page to loose photos unless the selected family is explicitly a collage-only page.",
    photoOnlyPages.length === 0 ? "Every inner page carries editorial text or structured list content." : `Photo-only inner pages: ${photoOnlyPages.join(", ")}.`,
  ));

  const innerMeasurementPages = (measurement?.pageMetrics ?? [])
    .filter((metric) => metric.page >= firstInnerPage && metric.page <= lastInnerPage);
  const useful = innerMeasurementPages.length > 0
    ? innerMeasurementPages.reduce((sum, metric) => sum + metric.usefulOccupancy, 0) / innerMeasurementPages.length
    : measurement?.usefulOccupancy ?? 0;
  const minPageUtility = innerMeasurementPages.length > 0
    ? Math.min(...innerMeasurementPages.map((metric) => metric.usefulOccupancy))
    : measurement?.minPageUtility ?? useful;
  const underfilled = minPageUtility >= 0.72 ? 0 : measurement?.underfilledBlocks ?? 0;
  const lowUtility = minPageUtility >= 0.72 ? 0 : measurement?.lowUtilityBlocks ?? 0;
  const whiteSpaceScore = Math.max(0, Math.min(1, (useful / 0.74 + minPageUtility / 0.68) / 2 - Math.max(0, underfilled - 4) * 0.03 - Math.max(0, lowUtility - 4) * 0.035));
  rules.push(rule(
    "white-space-repair",
    "White-space repair",
    whiteSpaceScore >= 0.82 ? "pass" : whiteSpaceScore >= 0.62 ? "warn" : "fail",
    whiteSpaceScore,
    "If useful occupancy/page utility is low, grow adjacent photos, merge short text, or move lists into rails.",
    `Useful ${(useful * 100).toFixed(1)}%, min page utility ${(minPageUtility * 100).toFixed(1)}%, underfilled ${underfilled}, low-utility ${lowUtility}.`,
  ));

  const renderedQualityScore = Math.max(
    0,
    Math.min(1, (useful / 0.72 + minPageUtility / 0.62) / 2) -
      Math.max(0, underfilled - 6) * 0.025 -
      Math.max(0, lowUtility - 4) * 0.03 -
      placeholderImages * 0.2,
  );
  rules.push(rule(
    "rendered-quality-gate",
    "Rendered quality gate",
    placeholderImages > 0 ? "fail" : renderedQualityScore >= 0.82 ? "pass" : renderedQualityScore >= 0.62 ? "warn" : "fail",
    renderedQualityScore,
    "High symbolic Porter adherence must still produce real photos, filled pages, and low dead space.",
    `Real rendered photos ${realRenderedImages}/${imageBlocks.length}; useful ${(useful * 100).toFixed(1)}%; min page utility ${(minPageUtility * 100).toFixed(1)}%; underfilled ${underfilled}; low-utility ${lowUtility}.`,
  ));

  const widths = new Set(innerBlocks.filter((block) => block.articleId || block.imageId || block.kind === "list").map((block) => block.position.colSpan));
  const rhythmRatio = Math.min(1, widths.size / 5);
  const repeatedStacks = Array.from(
    innerBlocks
      .filter((block) => block.articleId || block.kind === "list")
      .reduce((map, block) => {
        const key = `${block.page}:${block.position.col}:${block.position.colSpan}`;
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>())
      .values(),
  ).filter((count) => count >= 3).length;
  const rhythmScore = Math.max(0, rhythmRatio - repeatedStacks * 0.2);
  rules.push(rule(
    "module-rhythm",
    "Varied module rhythm",
    rhythmScore >= 0.8 ? "pass" : rhythmScore >= 0.6 ? "warn" : "fail",
    rhythmScore,
    "Avoid repeated same-width stacked boxes; dense grids need varied widths and staggered panels.",
    `${widths.size} distinct module widths; ${repeatedStacks} repeated same-width stacks.`,
  ));

  const applicable = rules.filter((item) => item.status !== "not-applicable");
  const score = applicable.length
    ? applicable.reduce((sum, item) => sum + item.score, 0) / applicable.length
    : 1;
  const failed = rules.filter((item) => item.status === "fail").length;
  const warned = rules.filter((item) => item.status === "warn").length;
  const passed = rules.filter((item) => item.status === "pass").length;
  return {
    family: input.referenceFamily ?? "best-fit-Porter-family",
    score,
    summary: `${passed} passed, ${warned} warned, ${failed} failed across ${applicable.length} applicable Porter layout rules.`,
    rules,
  };
}
