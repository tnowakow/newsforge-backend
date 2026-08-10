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

function articleTeasers(articles: Article[], max = 5): string {
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

function firstArticleMatching(articles: Article[], pattern: RegExp): Article | undefined {
  return articles.find((article) =>
    article.articleType !== "birthday" &&
    pattern.test(`${article.title}\n${article.body}\n${article.articleType ?? ""}`),
  );
}

function shortBody(article: Article | undefined, fallback: string, maxChars = 260): string {
  const raw = article?.body?.trim() || fallback;
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars).replace(/\s+\S*$/, "")}.`;
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
          position: { ...block.position, row: 5, rowSpan: 2 },
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
          position: { ...block.position, row: 7, rowSpan: 7 },
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
        position: { ...block.position, col: 9, row: 1, colSpan: 12, rowSpan: 7 },
      };
    }
    if (block.slotId === "cl-p1-happy-hour") {
      return {
        ...block,
        position: { ...block.position, row: 6, rowSpan: 5 },
      };
    }
    if (block.slotId === "cl-p1-upcoming-events") {
      return {
        ...block,
        position: { ...block.position, row: 8, rowSpan: 3 },
      };
    }
    if (block.slotId === "cl-p1-hh-img-a") {
      return {
        ...block,
        position: { ...block.position, col: 1, row: 11, colSpan: 8, rowSpan: 6 },
      };
    }
    if (block.slotId === "cl-p1-hh-img-b") {
      return {
        ...block,
        position: { ...block.position, col: 9, row: 11, colSpan: 5, rowSpan: 3 },
      };
    }
    if (block.slotId === "cl-p1-hh-img-c") {
      return {
        ...block,
        position: { ...block.position, col: 9, row: 14, colSpan: 5, rowSpan: 3 },
      };
    }
    if (block.slotId === "cl-p1-event-img-a") {
      return {
        ...block,
        position: { ...block.position, col: 14, row: 11, colSpan: 11, rowSpan: 6 },
      };
    }
    if (block.slotId === "cl-p1-event-img-b") {
      return {
        ...block,
        position: { ...block.position, col: 21, row: 1, colSpan: 4, rowSpan: 7 },
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

  const innerBlocks = layout.templateId === "v3-spread-classic"
    ? compactGatewayInnerBlocks(layout.blocks)
    : layout.blocks;

  const shiftedInnerBlocks = innerBlocks.map((block) => ({
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
  const tertiary = wrapperImages.find(
    (image) => image.id !== hero?.id && image.id !== secondary?.id,
  );
  const birthday = articles.find((article) =>
    article.articleType === "birthday" || /birthday/i.test(`${article.title}\n${article.body}`),
  );
  const executive = firstArticleMatching(articles, /executive|director/i);
  const events = firstArticleMatching(articles, /event|happy hour|outing|campus|calendar/i);
  const feature = firstArticleMatching(articles, /recap|spotlight|resident|volunteer|scrubbly|campus/i);

  const coverBlocks: LayoutBlock[] = [
    textBlock(
      "demo-cover-title",
      1,
      `${clientName}`,
      `${monthLabel}\nCommunity Newsletter`,
      { col: 1, row: 1, colSpan: 8, rowSpan: 4 },
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
      birthday?.title || "Happy Birthday!",
      shortBody(birthday, "Residents and team members celebrating this month.", 210),
      { col: 1, row: 5, colSpan: 8, rowSpan: 5 },
      {
        bg: "sun",
        headerColor: "coral",
        panelRole: "birthday",
        cornerRadius: 0,
        compact: true,
      },
    ),
    textBlock(
      "demo-cover-inside",
      1,
      "Inside This Issue",
      articleTeasers(articles),
      { col: 1, row: 10, colSpan: 8, rowSpan: 7 },
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
      "Executive Director Corner",
      shortBody(executive, `${clientName} shares a warm note on the month ahead.`, 330),
      { col: 9, row: 1, colSpan: 8, rowSpan: 7 },
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
      events?.title || "Upcoming Events",
      shortBody(events, "A quick look at upcoming campus moments and ways to connect.", 260),
      { col: 9, row: 12, colSpan: 8, rowSpan: 5 },
      {
        bg: "sky",
        headerColor: "coral",
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
          col: 17,
          row: 1,
          colSpan: 8,
          rowSpan: 11,
        },
        hero.caption ?? hero.alt,
      ),
    );
  }

  const backBlocks: LayoutBlock[] = [
    textBlock(
      "demo-back-note",
      4,
      feature?.title || "Stay Connected",
      shortBody(feature, `${clientName} closes ${monthLabel} with gratitude for the residents, families, and team members who make every gathering feel personal.`, 360),
      { col: 1, row: 1, colSpan: 10, rowSpan: 8 },
      {
        bg: "sky",
        headerColor: "navy",
        panelRole: "featureBand",
        scriptHeading: true,
        cornerRadius: 0,
        compact: true,
      },
    ),
    textBlock(
      "demo-back-events",
      4,
      "Looking Ahead",
      closingCopy(),
      { col: 1, row: 9, colSpan: 10, rowSpan: 8 },
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
      "demo-back-contact",
      4,
      "Out and About",
      shortBody(events, "Fresh events, outings, and campus moments continue next month.", 270),
      { col: 11, row: 10, colSpan: 7, rowSpan: 7 },
      {
        bg: "cream",
        headerColor: "coral",
        panelRole: "outingList",
        cornerRadius: 0,
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
          col: 11,
          row: 1,
          colSpan: 14,
          rowSpan: 9,
        },
        secondary.caption ?? secondary.alt,
      ),
    );
  }
  if (tertiary) {
    backBlocks.push(
      imageBlock(
        "demo-back-small-photo",
        4,
        tertiary.id,
        { col: 18, row: 10, colSpan: 7, rowSpan: 7 },
        tertiary.caption ?? tertiary.alt,
      ),
    );
  } else {
    backBlocks.push(
      textBlock(
        "demo-back-save-date",
        4,
        "Save the Date",
        "Watch for next month's celebrations, outings, and campus updates.",
        { col: 18, row: 10, colSpan: 7, rowSpan: 7 },
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
