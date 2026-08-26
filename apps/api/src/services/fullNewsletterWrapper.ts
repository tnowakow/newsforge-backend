import type {
  Article,
  AssembledLayout,
  LayoutBlock,
  NewsImage,
} from "@newsforge/shared/schemas";

interface WrapperInput {
  layout: AssembledLayout;
  articles: Article[];
  images?: NewsImage[];
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
  kind: LayoutBlock["kind"] = "article",
): LayoutBlock {
  return {
    blockId: id,
    slotId: id,
    page,
    position,
    kind,
    inlineText,
    heading,
    needsFiller: false,
    zIndex: 0,
    style,
  };
}

function articleTeasers(articles: Article[], max = 5): string {
  const titles = articles
    .filter((article) => !article.isFiller)
    .slice(0, max)
    .map((article) => article.title.trim())
    .filter((title) => title && !/\.docx$/i.test(title));
  return titles.length
    ? titles.map((title) => `- ${title}`).join("\n")
    : "- Community updates\n- Upcoming events\n- Campus moments";
}

function wrapperArticles(articles: Article[]): Article[] {
  return articles.filter((article) =>
    !article.isFiller &&
    !/\.docx$/i.test(article.title) &&
    article.articleType !== "birthday" &&
    !/birthday/i.test(`${article.title}\n${article.body}`),
  );
}

function excerpt(article: Article | undefined, fallback: string, maxWords = 44): string {
  if (!article) return fallback;
  const words = article.body.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return fallback;
  return words.slice(0, maxWords).join(" ") + (words.length > maxWords ? "…" : "");
}

function dedupeBirthdayBlocks(blocks: LayoutBlock[], articles: Article[]): LayoutBlock[] {
  const birthdayIds = new Set(
    articles
      .filter((article) => article.articleType === "birthday" || /birthday/i.test(`${article.title}\n${article.body}`))
      .map((article) => article.id),
  );
  let kept = false;
  return blocks.filter((block) => {
    const isBirthday = block.style?.panelRole === "birthday" || Boolean(block.articleId && birthdayIds.has(block.articleId));
    if (!isBirthday) return true;
    if (kept) return false;
    kept = true;
    return true;
  });
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

function compactGatewayInnerBlocks(blocks: LayoutBlock[]): LayoutBlock[] {
  return blocks.map((block) => {
    if (block.page === 2) {
      if (block.slotId === "cl-p2-outings") {
        return {
          ...block,
          position: { ...block.position, row: 1, rowSpan: 4 },
        };
      }
      if (block.slotId === "cl-p2-smile") {
        return {
          ...block,
          position: { ...block.position, row: 1, rowSpan: 13 },
        };
      }
      if (block.slotId === "cl-p2-feature-band") {
        return {
          ...block,
          position: { ...block.position, row: 5, rowSpan: 3 },
        };
      }
      if (block.slotId === "cl-p2-photo-b") {
        return {
          ...block,
          position: { ...block.position, row: 5, rowSpan: 4 },
        };
      }
      if (block.slotId === "cl-p2-volunteer-img") {
        return {
          ...block,
          position: { ...block.position, row: 8, rowSpan: 6 },
        };
      }
      if (block.slotId === "cl-p2-volunteer") {
        return {
          ...block,
          position: { ...block.position, row: 8, rowSpan: 6 },
        };
      }
      if (block.slotId === "cl-p2-trust-funds") {
        return {
          ...block,
          style: {
            ...(block.style ?? {}),
            bg: "navy",
            headerColor: "paper",
            invertText: true,
            panelRole: "infoFooter",
            centered: true,
            compact: true,
            cornerRadius: 0,
          },
          position: { ...block.position, row: 14, rowSpan: 3 },
        };
      }
      return block;
    }
    if (block.page !== 1) return block;
    if (block.slotId === "cl-p1-bday") {
      return {
        ...block,
        position: { ...block.position, row: 1, rowSpan: 5 },
      };
    }
    if (block.slotId === "cl-p1-exec") {
      return {
        ...block,
        position: { ...block.position, col: 9, row: 1, colSpan: 12, rowSpan: 5 },
      };
    }
    if (block.slotId === "cl-p1-happy-hour") {
      return {
        ...block,
        position: { ...block.position, row: 6, rowSpan: 2 },
      };
    }
    if (block.slotId === "cl-p1-upcoming-events") {
      return {
        ...block,
        position: { ...block.position, row: 6, rowSpan: 2 },
      };
    }
    if (block.slotId === "cl-p1-hh-img-a") {
      return {
        ...block,
        position: { ...block.position, col: 1, row: 8, colSpan: 8, rowSpan: 9 },
      };
    }
    if (block.slotId === "cl-p1-hh-img-b") {
      return {
        ...block,
        position: { ...block.position, col: 9, row: 8, colSpan: 5, rowSpan: 5 },
      };
    }
    if (block.slotId === "cl-p1-hh-img-c") {
      return {
        ...block,
        position: { ...block.position, col: 9, row: 13, colSpan: 5, rowSpan: 4 },
      };
    }
    if (block.slotId === "cl-p1-event-img-a") {
      return {
        ...block,
        position: { ...block.position, col: 14, row: 8, colSpan: 11, rowSpan: 9 },
      };
    }
    if (block.slotId === "cl-p1-event-img-b") {
      return {
        ...block,
        position: { ...block.position, col: 21, row: 1, colSpan: 4, rowSpan: 5 },
      };
    }
    return block;
  });
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

  const innerBlocks = dedupeBirthdayBlocks(layout.templateId === "v3-spread-classic"
    ? compactGatewayInnerBlocks(layout.blocks)
    : layout.blocks, articles);

  const shiftedInnerBlocks = innerBlocks.map((block) => ({
    ...block,
    page: block.page + 1,
  }));

  const sourceArticles = wrapperArticles(articles);
  const director = sourceArticles.find((article) => /executive director|director/i.test(article.title));
  const feature = sourceArticles.find((article) => article.id !== director?.id) ?? director;
  const closing = sourceArticles.find((article) => article.id !== director?.id && article.id !== feature?.id) ?? feature;
  const placedImageIds = new Set(innerBlocks.flatMap((block) => block.imageId ? [block.imageId] : []));
  const wrapperImages = (images ?? []).filter((image) => !placedImageIds.has(image.id));
  const coverImage = wrapperImages[0];
  const backImage = wrapperImages[1];

  const coverBlocks: LayoutBlock[] = [
    textBlock(
      "demo-cover-title",
      1,
      `${clientName}`,
      `${monthLabel}\nCommunity Newsletter`,
      { col: 1, row: 1, colSpan: 10, rowSpan: 4 },
      {
        bg: "cream",
        headerColor: "primary",
        panelRole: "featureBand",
        cornerRadius: 0,
        centered: true,
        compact: true,
      },
    ),
    textBlock(
      "demo-cover-birthday",
      1,
      "Birthdays",
      "Resident and team celebrations appear here when supplied with the monthly packet.",
      { col: 1, row: 5, colSpan: 5, rowSpan: 4 },
      {
        bg: "sun",
        headerColor: "coral",
        panelRole: "birthday",
        cornerRadius: 0,
        compact: true,
      },
      "filler",
    ),
    textBlock(
      "demo-cover-inside",
      1,
      "In This Issue",
      articleTeasers(articles),
      { col: 1, row: 9, colSpan: 5, rowSpan: 8 },
      {
        bg: "navy",
        headerColor: "paper",
        invertText: true,
        panelRole: "infoFooter",
        cornerRadius: 0,
        compact: true,
      },
    ),
    textBlock(
      "demo-cover-director",
      1,
      director?.title ?? "From Our Community",
      excerpt(director, `${clientName} celebrates the people, moments, and connections that shape our month.`),
      { col: 6, row: 5, colSpan: 10, rowSpan: 7 },
      {
        bg: "cream",
        headerColor: "primary",
        panelRole: "directorCorner",
        cornerRadius: 10,
        compact: true,
      },
    ),
    textBlock(
      "demo-cover-events",
      1,
      feature?.title ?? "Community Highlights",
      excerpt(feature, "Discover this month's resident stories, campus moments, and upcoming opportunities to connect.", 26),
      { col: 6, row: 12, colSpan: 10, rowSpan: 5 },
      {
        bg: "sky",
        headerColor: "coral",
        panelRole: "upcomingEvents",
        cornerRadius: 0,
        compact: true,
      },
    ),
    textBlock(
      "demo-cover-community",
      1,
      "Community Snapshot",
      coverImage?.caption ?? feature?.title ?? "This month's community moments",
      { col: 16, row: 1, colSpan: 9, rowSpan: 16 },
      {
        bg: "leaf",
        headerColor: "paper",
        invertText: true,
        panelRole: "infoFooter",
        cornerRadius: 0,
        compact: true,
        centered: true,
      },
    ),
  ];

  if (coverImage?.id) {
    const coverPhoto = coverBlocks.find((block) => block.blockId === "demo-cover-community");
    if (coverPhoto) {
      coverPhoto.kind = "image";
      coverPhoto.imageId = coverImage.id;
      coverPhoto.caption = coverImage.caption;
      coverPhoto.inlineText = undefined;
      coverPhoto.heading = undefined;
      coverPhoto.style = { photoTreatment: "rounded", cornerRadius: 10 };
    }
  }

  const backBlocks: LayoutBlock[] = [
    textBlock(
      "demo-back-looking-ahead",
      4,
      closing?.title ?? "More From Our Community",
      excerpt(closing, "More resident stories, events, and campus highlights are shared throughout this issue."),
      { col: 1, row: 1, colSpan: 10, rowSpan: 7 },
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
    textBlock(
      "demo-back-calendar",
      4,
      "Stay Connected",
      articleTeasers(sourceArticles, 4),
      { col: 1, row: 8, colSpan: 10, rowSpan: 9 },
      {
        bg: "coral",
        headerColor: "paper",
        invertText: true,
        panelRole: "upcomingEvents",
        cornerRadius: 0,
        compact: true,
        centered: true,
      },
    ),
    textBlock(
      "demo-back-family",
      4,
      "Community Moments",
      backImage?.caption ?? closing?.title ?? "The people and places that made this month special",
      { col: 11, row: 1, colSpan: 14, rowSpan: 11 },
      {
        bg: "cream",
        headerColor: "primary",
        panelRole: "featureBand",
        cornerRadius: 0,
        compact: true,
      },
    ),
    textBlock(
      "demo-back-office",
      4,
      "Thank You",
      `${clientName} is grateful for the residents, families, team members, and neighbors who make the community feel like home.`,
      { col: 11, row: 12, colSpan: 7, rowSpan: 5 },
      {
        bg: "sky",
        headerColor: "navy",
        panelRole: "infoFooter",
        cornerRadius: 0,
        compact: true,
      },
    ),
    textBlock(
      "demo-back-thanks",
      4,
      "Next Month",
      "Watch for new stories, events, and community updates in the next issue.",
      { col: 18, row: 12, colSpan: 7, rowSpan: 5 },
      {
        bg: "berry",
        headerColor: "paper",
        invertText: true,
        panelRole: "spotlightRail",
        cornerRadius: 0,
        compact: true,
        centered: true,
      },
    ),
  ];

  if (backImage?.id) {
    const backPhoto = backBlocks.find((block) => block.blockId === "demo-back-family");
    if (backPhoto) {
      backPhoto.kind = "image";
      backPhoto.imageId = backImage.id;
      backPhoto.caption = backImage.caption;
      backPhoto.inlineText = undefined;
      backPhoto.heading = undefined;
      backPhoto.style = { photoTreatment: "rounded", cornerRadius: 10 };
    }
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
