import type {
  Article,
  AssembledLayout,
  LayoutBlock,
} from "@newsforge/shared/schemas";

interface WrapperInput {
  layout: AssembledLayout;
  articles: Article[];
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
      "Happy Birthday!",
      "Residents and team members celebrating this month are recognized on the posted community calendar.",
      { col: 1, row: 5, colSpan: 8, rowSpan: 5 },
      {
        bg: "sun",
        headerColor: "coral",
        panelRole: "featureBand",
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
      `${clientName} shares a warm note on the month ahead, with reflections from community leadership and reminders for residents, families, and team members.`,
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
      "Around Campus",
      "Look inside for upcoming activities, campus gatherings, resident moments, and ways to stay connected throughout the month.",
      { col: 9, row: 12, colSpan: 8, rowSpan: 5 },
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
      "Community Notes",
      "For full details, times, and any updates, please check the posted calendar or connect with a member of the community team.",
      { col: 17, row: 1, colSpan: 8, rowSpan: 16 },
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

  const backBlocks: LayoutBlock[] = [
    textBlock(
      "demo-back-looking-ahead",
      4,
      "Looking Ahead",
      "Thank you for being part of this month's community story. Watch for next month's celebrations, outings, campus updates, and everyday moments of connection.",
      { col: 1, row: 1, colSpan: 8, rowSpan: 8 },
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
      "Save the Date",
      "Please refer to the posted community calendar for dates, times, sign-ups, and any schedule changes.",
      { col: 9, row: 1, colSpan: 8, rowSpan: 8 },
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
      "Family & Friends",
      "Families and friends are always welcome to reach out to the community team with questions about activities, visits, and ways to participate.",
      { col: 17, row: 1, colSpan: 8, rowSpan: 8 },
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
      "Community Office",
      "For questions about services, statements, trust funds, or other business office needs, please contact the community team directly.",
      { col: 1, row: 9, colSpan: 8, rowSpan: 8 },
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
      "Thank You",
      `${clientName} is grateful for the residents, families, team members, and neighbors who make the community feel like home.`,
      { col: 9, row: 9, colSpan: 8, rowSpan: 8 },
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
    textBlock(
      "demo-back-next-issue",
      4,
      "Next Issue",
      "Look for more resident stories, campus highlights, events, and community updates in next month's newsletter.",
      { col: 17, row: 9, colSpan: 8, rowSpan: 8 },
      {
        bg: "leaf",
        headerColor: "paper",
        invertText: true,
        panelRole: "upcomingEvents",
        cornerRadius: 0,
        compact: true,
        centered: true,
      },
    ),
  ];

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
