import type {
  Article,
  AssembledLayout,
  GridSpec,
  LayoutBlock,
  NewsImage,
  VisualPersonality,
} from "@newsforge/shared/schemas";
import { normalizePanelStyle } from "./designLanguage.js";
import {
  buildPorterSourceUnits,
  classifyPorterSourceRole,
  isPorterDirectorArticle,
  isPorterNarrativeOutingArticle,
  isPorterScheduleArticle,
  porterBirthdayRowsFromText,
  porterDatedRowCount,
  porterDatedRowsFromText,
  porterImageMatchesRef,
} from "./porterSourceSemantics.js";

interface PorterCompoundPlannerInput {
  templateId: string;
  pageCount: number;
  gridSpec: GridSpec;
  articles: Article[];
  images: NewsImage[];
  visualPersonality?: VisualPersonality;
  previousVersion?: number;
}

interface PlannedBlock {
  block: LayoutBlock;
  area: number;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/\s+[,;:.!?]+$/g, "").trim();
}

function isFilenameCaption(caption: string | undefined): boolean {
  return Boolean(caption && /\.(jpe?g|png|gif|webp|heic|heif|tiff?)$/i.test(caption.trim()));
}

function captionForArticle(article: Article | undefined, image: NewsImage): string | undefined {
  if (!article) return isFilenameCaption(image.caption) ? undefined : image.caption;
  const title = cleanTitle(article.title);
  if (title.length >= 4) return title;
  return isFilenameCaption(image.caption) ? undefined : image.caption;
}

function listRowsForArticle(article: Article): LayoutBlock["listItems"] {
  const role = classifyPorterSourceRole(article);
  if (role === "birthday-roster") return porterBirthdayRowsFromText(article.body);
  if (role === "dated-list") return porterDatedRowsFromText(article.body);
  return article.body
    .split(/\n+|;\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
      return match
        ? { label: match[1], value: match[2].trim() }
        : { label: line };
    });
}

function styleForArticle(article: Article, index: number): LayoutBlock["style"] {
  const role = classifyPorterSourceRole(article);
  if (role === "director-note") {
    return normalizePanelStyle({ bg: "cream", headerColor: "navy", panelRole: "directorCorner", compact: true, cornerRadius: 6 });
  }
  if (role === "birthday-roster") {
    return normalizePanelStyle({ bg: "sun", headerColor: "coral", panelRole: "birthday", scriptHeading: true, compact: true, cornerRadius: 0 });
  }
  if (role === "dated-list") {
    const panelRole = /happy/i.test(article.title)
      ? "happyHour"
      : /brunch/i.test(article.title)
        ? "infoFooter"
        : "upcomingEvents";
    return normalizePanelStyle({
      bg: panelRole === "happyHour" ? "sky" : "cream",
      headerColor: panelRole === "happyHour" ? "navy" : "coral",
      panelRole,
      compact: true,
      cornerRadius: 6,
    });
  }
  if (isPorterNarrativeOutingArticle(article)) {
    return normalizePanelStyle({ bg: "navy", headerColor: "sky", invertText: true, panelRole: "outingList", compact: true, cornerRadius: 6 });
  }
  if (role === "profile-story") {
    return normalizePanelStyle({ bg: "berry", headerColor: "navy", panelRole: "spotlightRail", compact: true, cornerRadius: 6 });
  }
  const styles: Array<LayoutBlock["style"]> = [
    { bg: "sky", headerColor: "navy" },
    { bg: "cream", headerColor: "coral" },
    { bg: "blush", headerColor: "navy" },
    { bg: "paper", headerColor: "leaf" },
  ];
  return normalizePanelStyle({ ...styles[index % styles.length], panelRole: "featureBand", compact: true, cornerRadius: 6 });
}

function photoStyle(pairedArticle?: Article): LayoutBlock["style"] {
  return pairedArticle
    ? { photoTreatment: "rounded", cornerRadius: 6 }
    : { panelRole: "photoCluster", photoTreatment: "collage", cornerRadius: 8 };
}

function railWidth(rowCount: number, fallback = 5): number {
  if (rowCount >= 14) return 7;
  if (rowCount >= 8) return 6;
  return fallback;
}

function railHeight(rowCount: number, maxRows: number): number {
  if (rowCount >= 10) return maxRows;
  if (rowCount >= 6) return Math.min(9, maxRows);
  return Math.min(6, maxRows);
}

function blockArea(block: LayoutBlock): number {
  return block.position.colSpan * block.position.rowSpan;
}

function positionsOverlap(a: LayoutBlock["position"], b: LayoutBlock["position"]): boolean {
  return !(
    a.col + a.colSpan - 1 < b.col ||
    b.col + b.colSpan - 1 < a.col ||
    a.row + a.rowSpan - 1 < b.row ||
    b.row + b.rowSpan - 1 < a.row
  );
}

function imageIsScreenshotLike(image: NewsImage): boolean {
  return [image.caption, image.alt, image.description, image.url].some((value) =>
    /\bscreen\s*shot\b|\bscreenshot\b|\bscreencap\b|\bscreen\s*capture\b/i.test(value ?? ""),
  );
}

function sortSourceArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => (a.sourceOrder ?? 999) - (b.sourceOrder ?? 999) || a.id.localeCompare(b.id));
}

function scoreImageForArticle(image: NewsImage, article: Article): number {
  const refs = article.imageRefs ?? [];
  if (refs.some((ref) => porterImageMatchesRef(image, ref))) return 100;
  const title = article.title.toLowerCase();
  const imageText = `${image.caption ?? ""} ${image.alt ?? ""} ${image.description ?? ""} ${image.url ?? ""}`.toLowerCase();
  if (isPorterDirectorArticle(article) && /director|headshot|portrait|leader|administrator/.test(imageText)) return 70;
  if (/outing|out\s*(?:&|and)\s*about/i.test(title) && /outing|cruise|trip|lunch|dairy|community/.test(imageText)) return 55;
  if (/breakfast/i.test(title) && /breakfast/.test(imageText)) return 55;
  if (/tea|mother/i.test(title) && /tea|mother/.test(imageText)) return 55;
  return 0;
}

export function buildPorterCompoundLayout(input: PorterCompoundPlannerInput): AssembledLayout | undefined {
  if (input.gridSpec.columns !== 24 || input.gridSpec.rowsPerPage !== 16) return undefined;
  const articles = sortSourceArticles(input.articles.filter((article) => article.source === "UPLOAD"));
  if (articles.length < 5 || input.images.length < 3) return undefined;
  const units = buildPorterSourceUnits(articles, input.images);
  const hasDirector = units.some((unit) => unit.role === "director-note");
  const hasStoryCompounds = units.filter((unit) => unit.role === "narrative-story" || unit.role === "profile-story").length >= 3;
  const hasRail = units.some((unit) => unit.role === "dated-list" && (unit.rows?.length ?? 0) >= 8);
  if (!hasDirector || !hasStoryCompounds || !hasRail) return undefined;

  const rowsPerPage = input.gridSpec.rowsPerPage;
  const blocks: PlannedBlock[] = [];
  const usedImages = new Set<string>();
  const usedArticles = new Set<string>();
  const images = [...input.images].sort((a, b) => Number(imageIsScreenshotLike(a)) - Number(imageIsScreenshotLike(b)) || a.id.localeCompare(b.id));
  const explicitReservedImageIds = new Set(
    articles.flatMap((article) =>
      (article.imageRefs ?? []).flatMap((ref) =>
        images.filter((image) => porterImageMatchesRef(image, ref)).map((image) => image.id),
      ),
    ),
  );
  const addBlock = (block: Omit<LayoutBlock, "blockId" | "zIndex">): LayoutBlock => {
    const full: LayoutBlock = { ...block, blockId: `compound-${blocks.length + 1}`, zIndex: 0 };
    blocks.push({ block: full, area: blockArea(full) });
    if (full.articleId) usedArticles.add(full.articleId);
    if (full.imageId) usedImages.add(full.imageId);
    return full;
  };
  const articleBlock = (
    article: Article,
    page: number,
    col: number,
    row: number,
    colSpan: number,
    rowSpan: number,
    index: number,
  ): LayoutBlock => {
    const role = classifyPorterSourceRole(article);
    const isList = role === "birthday-roster" || role === "dated-list";
    return addBlock({
      slotId: `source-${article.id}`,
      page,
      position: { col, row, colSpan, rowSpan },
      kind: isList ? "list" : role === "director-note" || role === "profile-story" ? "recurring" : "article",
      articleId: isList ? undefined : article.id,
      heading: cleanTitle(article.title),
      listItems: isList ? listRowsForArticle(article) : undefined,
      needsFiller: false,
      style: styleForArticle(article, index),
      sourceRole: role,
      sourceOrder: article.sourceOrder ?? index,
      compoundId: `compound-${article.id}`,
    });
  };
  const takeImages = (article: Article | undefined, count: number): NewsImage[] => {
    const explicitMatches = article
      ? images.filter((image) =>
        !usedImages.has(image.id) &&
        (article.imageRefs ?? []).some((ref) => porterImageMatchesRef(image, ref)),
      )
      : [];
    if (explicitMatches.length > 0) return explicitMatches.slice(0, count);
    const scored = images
      .filter((image) => !usedImages.has(image.id))
      .filter((image) => article ? !explicitReservedImageIds.has(image.id) : !explicitReservedImageIds.has(image.id))
      .map((image) => ({ image, score: article ? scoreImageForArticle(image, article) : 1 }))
      .filter((entry) => entry.score > 0 || !article)
      .sort((a, b) => b.score - a.score || a.image.id.localeCompare(b.image.id));
    return scored.slice(0, count).map((entry) => entry.image);
  };
  const imageBlock = (
    image: NewsImage | undefined,
    page: number,
    col: number,
    row: number,
    colSpan: number,
    rowSpan: number,
    pairedArticle?: Article,
  ): void => {
    if (!image || usedImages.has(image.id)) return;
    addBlock({
      slotId: `source-${image.id}`,
      page,
      position: { col, row, colSpan, rowSpan },
      kind: "image",
      imageId: image.id,
      caption: captionForArticle(pairedArticle, image),
      needsFiller: false,
      style: photoStyle(pairedArticle),
      sourceRole: pairedArticle ? classifyPorterSourceRole(pairedArticle) : undefined,
      sourceOrder: pairedArticle?.sourceOrder,
      compoundId: pairedArticle ? `compound-${pairedArticle.id}` : undefined,
    });
  };

  const birthday = articles.find((article) => classifyPorterSourceRole(article) === "birthday-roster");
  const director = articles.find(isPorterDirectorArticle) ?? articles[0];
  if (!director) return undefined;
  const schedules = articles
    .filter(isPorterScheduleArticle)
    .sort((a, b) => porterDatedRowCount(b) - porterDatedRowCount(a));
  const longRail = schedules[0];
  if (!longRail) return undefined;
  const storyArticles = articles
    .filter((article) =>
      article.id !== director.id &&
      article.id !== birthday?.id &&
      !schedules.some((schedule) => schedule.id === article.id) &&
      classifyPorterSourceRole(article) !== "brief",
    )
    .sort((a, b) => Number(isPorterNarrativeOutingArticle(b)) - Number(isPorterNarrativeOutingArticle(a)) || (a.sourceOrder ?? 999) - (b.sourceOrder ?? 999));
  const briefs = articles.filter((article) =>
    !usedArticles.has(article.id) &&
    article.id !== director.id &&
    article.id !== birthday?.id &&
    !schedules.some((schedule) => schedule.id === article.id) &&
    !storyArticles.some((story) => story.id === article.id),
  );

  const birthdayRowCount = birthday ? (listRowsForArticle(birthday)?.length ?? 0) : 0;
  const leftRailWidth = birthday ? railWidth(birthdayRowCount, 5) : 0;
  const eventRailWidth = railWidth(porterDatedRowCount(longRail), 7);
  const eventRailCol = 25 - eventRailWidth;
  if (birthday) {
    articleBlock(birthday, 1, 1, 1, leftRailWidth, railHeight(birthdayRowCount, rowsPerPage), 0);
  }

  const directorCol = birthday ? leftRailWidth + 1 : 1;
  const directorWidth = birthday ? 9 : 10;
  articleBlock(director, 1, directorCol, 1, directorWidth, 7, 1);
  imageBlock(takeImages(director, 1)[0], 1, directorCol + directorWidth, 1, 4, 7, director);

  const pageOneRightCol = directorCol + directorWidth + 4;
  const pageOneRightWidth = Math.max(24 - pageOneRightCol + 1, 5);
  const [storyA, storyB, storyC, storyD] = storyArticles;
  if (storyA) {
    articleBlock(storyA, 1, pageOneRightCol, 1, pageOneRightWidth, 5, 2);
    const [first, second] = takeImages(storyA, 2);
    const photoWidth = Math.max(3, Math.floor(pageOneRightWidth / 2));
    imageBlock(first, 1, pageOneRightCol, 6, photoWidth, 5, storyA);
    imageBlock(second, 1, pageOneRightCol + photoWidth, 6, pageOneRightWidth - photoWidth, 5, storyA);
  }
  if (storyB) {
    const storyCol = birthday ? directorCol : 1;
    const storyWidth = Math.min(13, 24 - storyCol + 1);
    articleBlock(storyB, 1, storyCol, 8, storyWidth, 4, 3);
    const [first, second] = takeImages(storyB, 2);
    imageBlock(first, 1, storyCol, 12, Math.floor(storyWidth / 2), 5, storyB);
    imageBlock(second, 1, storyCol + Math.floor(storyWidth / 2), 12, storyWidth - Math.floor(storyWidth / 2), 5, storyB);
  }

  if (storyC) {
    articleBlock(storyC, 2, 1, 1, 9, 5, 4);
    const [first, second] = takeImages(storyC, 2);
    imageBlock(first, 2, 10, 1, 4, 5, storyC);
    imageBlock(second, 2, 14, 1, eventRailCol - 14, 5, storyC);
  }
  if (storyD) {
    articleBlock(storyD, 2, 1, 6, 9, 5, 5);
    const [first, second] = takeImages(storyD, 2);
    imageBlock(first, 2, 10, 6, 4, 5, storyD);
    imageBlock(second, 2, 14, 6, eventRailCol - 14, 5, storyD);
  }
  if (longRail) {
    articleBlock(longRail, 2, eventRailCol, 1, eventRailWidth, rowsPerPage, 6);
  }

  const pageTwoBottomCols = eventRailCol - 1;
  for (const image of takeImages(undefined, 3)) {
    const used = blocks.filter((entry) => entry.block.page === 2).map((entry) => entry.block);
    const preferred: LayoutBlock["position"][] = [
      { col: 1, row: 11, colSpan: 6, rowSpan: 6 },
      { col: 7, row: 11, colSpan: 6, rowSpan: 6 },
      { col: 13, row: 11, colSpan: pageTwoBottomCols - 12, rowSpan: 6 },
    ];
    const position = preferred.find((candidate) =>
      candidate.colSpan > 0 && !used.some((block) => positionsOverlap(block.position, candidate)),
    );
    if (!position) continue;
    imageBlock(image, 2, position.col, position.row, position.colSpan, position.rowSpan);
  }

  for (const article of [...schedules.slice(1), ...briefs, ...storyArticles.slice(4)]) {
    if (usedArticles.has(article.id)) continue;
    const positions: Array<{ page: number; position: LayoutBlock["position"] }> = [
      { page: 1, position: { col: 1, row: 10, colSpan: leftRailWidth || 5, rowSpan: 7 } },
      { page: 2, position: { col: 1, row: 11, colSpan: 8, rowSpan: 3 } },
      { page: 2, position: { col: 9, row: 11, colSpan: 8, rowSpan: 3 } },
    ];
    const placement = positions.find(({ page, position }) =>
      !blocks.some((entry) => entry.block.page === page && positionsOverlap(entry.block.position, position)),
    );
    if (!placement) continue;
    articleBlock(article, placement.page, placement.position.col, placement.position.row, placement.position.colSpan, placement.position.rowSpan, 7);
  }

  const laidOut = blocks.map((entry) => entry.block);
  if (laidOut.length === 0) return undefined;
  return {
    templateId: input.templateId,
    pageCount: input.pageCount,
    visualPersonality: input.visualPersonality,
    blocks: laidOut,
    unfilledSlotIds: [],
    stats: {
      placedArticles: new Set(laidOut.map((block) => block.articleId).filter(Boolean)).size + laidOut.filter((block) => block.kind === "list").length,
      placedImages: laidOut.filter((block) => block.imageId).length,
      fillerBlocks: 0,
      emptySlots: 0,
    },
    version: (input.previousVersion ?? 0) + 1,
  };
}
