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

function backPageCopy(articles: Article[]): string {
  const event = articles.find((article) =>
    /event|calendar|activity|outing|happy hour/i.test(
      `${article.title} ${article.body.slice(0, 160)}`,
    ),
  );
  if (event) {
    return event.body.split(/\n{2,}/)[0]?.trim() || event.title;
  }
  return "Thank you for being part of this month's community story. Watch for upcoming events, resident celebrations, and new ways to connect with neighbors and the team.";
}

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

  const hero = images[0];
  const secondary = images.find((image) => image.id !== hero?.id);
  const lead = articles[0];
  const coverBlocks: LayoutBlock[] = [
    textBlock(
      "demo-cover-title",
      1,
      `${clientName}`,
      `${monthLabel}\nCommunity Newsletter`,
      { col: 2, row: 2, colSpan: hero ? 10 : 22, rowSpan: 5 },
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
      { col: 2, row: 9, colSpan: hero ? 10 : 22, rowSpan: 6 },
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
        { col: 13, row: 2, colSpan: 11, rowSpan: 13 },
        hero.caption ?? hero.alt,
      ),
    );
  }

  const backBlocks: LayoutBlock[] = [
    textBlock(
      "demo-back-note",
      4,
      lead?.title ?? "Community Notes",
      lead
        ? lead.body.split(/\n{2,}/)[0]?.trim() || lead.title
        : "A few favorite moments and helpful reminders from around the community.",
      { col: 2, row: 2, colSpan: secondary ? 12 : 22, rowSpan: 6 },
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
      backPageCopy(articles),
      { col: 2, row: 9, colSpan: secondary ? 12 : 22, rowSpan: 5 },
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
        { col: 15, row: 2, colSpan: 9, rowSpan: 12 },
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
