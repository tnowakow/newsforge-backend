import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, AssembledLayout } from "@newsforge/shared/schemas";
import { wrapV3InnerSpreadForDemo } from "../services/fullNewsletterWrapper.js";

const articles: Article[] = [
  {
    id: "a1",
    title: "Executive Director Corner",
    body: "A warm note for residents and families.",
    wordCount: 7,
    isFiller: false,
    source: "MOCK",
    articleType: "announcement",
  },
  {
    id: "a2",
    title: "Upcoming Events",
    body: "8/10: Music social\n8/18: Family brunch",
    wordCount: 6,
    isFiller: false,
    source: "MOCK",
    articleType: "event-recap",
  },
];

function innerSpread(): AssembledLayout {
  return {
    templateId: "v3-spread-classic",
    pageCount: 2,
    visualPersonality: "classic-community",
    blocks: [
      {
        blockId: "inner-p1",
        slotId: "inner-p1",
        page: 1,
        position: { col: 1, row: 1, colSpan: 8, rowSpan: 4 },
        kind: "article",
        articleId: "a1",
        needsFiller: false,
      },
      {
        blockId: "inner-p2",
        slotId: "inner-p2",
        page: 2,
        position: { col: 1, row: 1, colSpan: 8, rowSpan: 4 },
        kind: "article",
        articleId: "a2",
        needsFiller: false,
      },
    ],
    unfilledSlotIds: [],
    stats: { placedArticles: 2, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
    version: 1,
  };
}

describe("wrapV3InnerSpreadForDemo", () => {
  it("wraps a two-page v3 inner spread into a four-page demo newsletter", () => {
    const wrapped = wrapV3InnerSpreadForDemo({
      layout: innerSpread(),
      articles,
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
    });

    assert.equal(wrapped.pageCount, 4);
    assert.deepEqual(
      wrapped.blocks.filter((block) => block.blockId.startsWith("inner-")).map((block) => block.page),
      [2, 3],
    );
    assert.ok(wrapped.blocks.some((block) => block.page === 1 && block.blockId === "demo-cover-title"));
    assert.ok(wrapped.blocks.some((block) => block.page === 4 && block.blockId === "demo-back-looking-ahead"));
    assert.equal(wrapped.stats.placedImages, 0);
    assert.equal(wrapped.stats.fillerBlocks, 1);
  });

  it("does not wrap an already full-size run twice", () => {
    const once = wrapV3InnerSpreadForDemo({
      layout: innerSpread(),
      articles,
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
    });
    const twice = wrapV3InnerSpreadForDemo({
      layout: once,
      articles,
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
    });

    assert.equal(twice.blocks.length, once.blocks.length);
    assert.deepEqual(twice.blocks.map((block) => block.page), once.blocks.map((block) => block.page));
  });

  it("keeps wrappers source-aware without leaking filenames, birthday rosters, or client-fill instructions", () => {
    const birthdayArticles: Article[] = [
      {
        id: "birthday",
        title: "Happy Birthday!",
        body: "RESIDENTS\nMary Ann F. 7/3\nShirley S. 7/10",
        wordCount: 8,
        isFiller: false,
        source: "MOCK",
        articleType: "birthday",
      },
      {
        id: "filename",
        title: "July Newsletter Content.docx",
        body: "This filename must not appear as a real newsletter headline.",
        wordCount: 9,
        isFiller: false,
        source: "UPLOAD",
        articleType: "other",
      },
      ...articles,
    ];
    const layout = innerSpread();
    layout.blocks = [
      {
        blockId: "birthday-inner",
        slotId: "birthday-inner",
        page: 1,
        position: { col: 1, row: 1, colSpan: 8, rowSpan: 4 },
        kind: "article",
        articleId: "birthday",
        needsFiller: false,
      },
      {
        blockId: "image-inner",
        slotId: "image-inner",
        page: 2,
        position: { col: 1, row: 1, colSpan: 8, rowSpan: 4 },
        kind: "image",
        imageId: "i1",
        needsFiller: false,
      },
    ];

    const wrapped = wrapV3InnerSpreadForDemo({
      layout,
      articles: birthdayArticles,
      clientName: "Trilogy Health Services",
      monthLabel: "June 2026",
    });

    const wrapperBlocks = wrapped.blocks.filter((block) => block.page === 1 || block.page === 4);
    const wrapperText = wrapperBlocks
      .flatMap((block) => [block.heading, block.inlineText, block.caption])
      .filter(Boolean)
      .join("\n");
    assert.equal(/Mary Ann|Shirley|7\/3|7\/10/.test(wrapperText), false);
    assert.equal(/July Newsletter Content\.docx|filename must not appear|Client-fill area/.test(wrapperText), false);

    assert.equal(wrapperBlocks.some((block) => block.articleId), false);
    assert.equal(wrapperBlocks.some((block) => block.imageId), false);

    const coverBirthday = wrapped.blocks.find((block) => block.blockId === "demo-cover-birthday");
    assert.equal(coverBirthday?.kind, "filler");
    assert.equal(coverBirthday?.heading, "Birthdays");
    assert.match(coverBirthday?.inlineText ?? "", /when supplied/);
    assert.equal(coverBirthday?.style?.panelRole, "birthday");
    assert.equal(/Mary Ann|Shirley|7\/3|7\/10/.test(`${coverBirthday?.heading ?? ""}\n${coverBirthday?.inlineText ?? ""}`), false);
    assert.equal(wrapped.blocks.filter((block) => block.articleId === "birthday").length, 1);
  });
});
