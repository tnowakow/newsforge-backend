import type {
  Article,
  AssembledLayout,
  LayoutBlock,
  NewsImage,
} from "@newsforge/shared/schemas";

interface WrapperInput {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  clientName: string;
  monthLabel: string;
}

function textBlock(
  id: string,
  page: number,
  heading: string,
  inlineText: string,
  position: LayoutBlock["position"],
  style: LayoutBlock["style"] = {},
): LayoutBlock {
  return {
    blockId: id,
    slotId: id,
    page,
    position,
    kind: "filler",
    inlineText,
    heading,
    needsFiller: false,
    zIndex: 0,
    style,
  };
}

function imageBlock(
  id: string,
  page: number,
  imageId: string,
  position: LayoutBlock["position"],
  caption?: string,
): LayoutBlock {
  return {
    blockId: id,
    slotId: id,
    page,
    position,
    kind: "image",
    imageId,
    caption,
    needsFiller: false,
    zIndex: 0,
    style: { photoTreatment: "wide" },
  };
}

function articleTeasers(articles: Article[], max = 4): string {
  const titles = articles
    .slice(0, max)
    .map((article) => article.title.trim())
    .filter(Boolean);
  return titles.length
    ? titles.map((title) => `- ${title}`).join("\n")
    : "- Community updates\n- Resident moments\n- Upcoming events";
}

function closingCopy(): string {
  return "Thank you for being part of this month's community story. Watch for upcoming events, resident celebrations, and new ways to connect with neighbors and the team.";
}

/**
 * Wrapper cover/back pages use a 24×16 grid (same as v3 inner-spread
 * templates). To match the reference newsletters' "no white space, panels
 * touching" density, the two text bands + optional photo column must sum
 * to the full grid exactly — no dead rows/cols at any edge.
 */
const WRAP_COLS = 24;
const WRAP_ROWS = 16;
const WRAP_IMG_COL_SPAN = 9;
const WRAP_TOP_ROWSPAN = 7;
const WRAP_BOTTOM_ROWSPAN = WRAP_ROWS - WRAP_TOP_ROWSPAN; // 9

export function wrapV3InnerSpreadForDemo({
  layout,
  articles,
  images,
  clientName,
  monthLabel,
}: WrapperInput): AssembledLayout {
  if (!layout.templateId.startsWith("v3-") || layout.pageCount >= 4) {
    return layout;
  }

  const shiftedInnerBlocks = layout.blocks.map((block) => ({
    ...block,
    page: block.page + 1,
  }));

  const innerImageIds = new Set(
    shiftedInnerBlocks
      .map((block) => block.imageId)
      .filter((id): id is string => Boolean(id)),
  );
  const wrapperImages = images.filter((image) => !innerImageIds.has(image.id));
  const hero = wrapperImages[0];
  const secondary = wrapperImages.find((image) => image.id !== hero?.id);

  // Text column spans the full grid width when there is no photo to share
  // the page with; otherwise it yields WRAP_IMG_COL_SPAN columns on the
  // right to the photo, and the two always sum to WRAP_COLS (no gutter gap).
  const coverTextColSpan = hero ? WRAP_COLS - WRAP_IMG_COL_SPAN : WRAP_COLS;
  const backTextColSpan = secondary ? WRAP_COLS - WRAP_IMG_COL_SPAN : WRAP_COLS;

  const coverBlocks: LayoutBlock[] = [
    textBlock(
      "demo-cover-title",
      1,
      `${clientName}`,
      `${monthLabel}\nCommunity Newsletter`,
      { col: 1, row: 1, colSpan: coverTextColSpan, rowSpan: WRAP_TOP_ROWSPAN },
      {
        bg: "cream",
        headerColor: "primary",
        panelRole: "featureBand",
        cornerRadius: 0,
        centered: true,
      },
    ),
    textBlock(
      "demo-cover-teasers",
      1,
      "Inside This Issue",
      articleTeasers(articles),
      { col: 1, row: 1 + WRAP_TOP_ROWSPAN, colSpan: coverTextColSpan, rowSpan: WRAP_BOTTOM_ROWSPAN },
      {
        bg: "sky",
        headerColor: "navy",
        panelRole: "upcomingEvents",
        cornerRadius: 0,
        compact: true,
      },
    ),
  ];
  if (hero) {
    coverBlocks.push(
      imageBlock(
        "demo-cover-hero",
        1,
        hero.id,
        {
          col: WRAP_COLS - WRAP_IMG_COL_SPAN + 1,
          row: 1,
          colSpan: WRAP_IMG_COL_SPAN,
          rowSpan: WRAP_ROWS,
        },
        hero.caption ?? hero.alt,
      ),
    );
  }

  const backBlocks: LayoutBlock[] = [
    textBlock(
      "demo-back-note",
      4,
      "Stay Connected",
      `${clientName} closes ${monthLabel} with gratitude for the residents, families, and team members who make every gathering feel personal.`,
      { col: 1, row: 1, colSpan: backTextColSpan, rowSpan: WRAP_TOP_ROWSPAN },
      {
        bg: "cream",
        headerColor: "primary",
        panelRole: "directorCorner",
        scriptHeading: true,
        cornerRadius: 18,
      },
    ),
    textBlock(
      "demo-back-events",
      4,
      "Looking Ahead",
      closingCopy(),
      { col: 1, row: 1 + WRAP_TOP_ROWSPAN, colSpan: backTextColSpan, rowSpan: WRAP_BOTTOM_ROWSPAN },
      {
        bg: "navy",
        headerColor: "paper",
        invertText: true,
        panelRole: "infoFooter",
        cornerRadius: 0,
        centered: true,
        compact: true,
      },
    ),
  ];
  if (secondary) {
    backBlocks.push(
      imageBlock(
        "demo-back-photo",
        4,
        secondary.id,
        {
          col: WRAP_COLS - WRAP_IMG_COL_SPAN + 1,
          row: 1,
          colSpan: WRAP_IMG_COL_SPAN,
          rowSpan: WRAP_ROWS,
        },
        secondary.caption ?? secondary.alt,
      ),
    );
  }

  const blocks = [...coverBlocks, ...shiftedInnerBlocks, ...backBlocks];

  return {
    ...layout,
    pageCount: 4,
    blocks,
    stats: {
      placedArticles: blocks.filter((block) => block.articleId).length,
      placedImages: blocks.filter((block) => block.imageId).length,
      fillerBlocks: blocks.filter((block) => block.kind === "filler").length,
      emptySlots: blocks.filter((block) => block.kind === "empty").length,
    },
  };
}
