import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, AssembledLayout, NewsImage } from "@newsforge/shared/schemas";
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

const images: NewsImage[] = [
  {
    id: "i1",
    url: "https://example.com/hero.jpg",
    caption: "Residents at a summer gathering",
    aspect: "landscape",
    isPlaceholder: false,
    source: "STOCK",
  },
  {
    id: "i2",
    url: "https://example.com/back.jpg",
    caption: "A community activity",
    aspect: "landscape",
    isPlaceholder: false,
    source: "STOCK",
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
      images,
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
    });

    assert.equal(wrapped.pageCount, 4);
    assert.deepEqual(
      wrapped.blocks.filter((block) => block.blockId.startsWith("inner-")).map((block) => block.page),
      [2, 3],
    );
    assert.ok(wrapped.blocks.some((block) => block.page === 1 && block.blockId === "demo-cover-title"));
    assert.ok(wrapped.blocks.some((block) => block.page === 4 && block.blockId === "demo-back-events"));
    assert.equal(wrapped.stats.placedImages, 2);
    assert.equal(wrapped.stats.fillerBlocks, 9);
  });

  it("does not wrap an already full-size run twice", () => {
    const once = wrapV3InnerSpreadForDemo({
      layout: innerSpread(),
      articles,
      images,
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
    });
    const twice = wrapV3InnerSpreadForDemo({
      layout: once,
      articles,
      images,
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
    });

    assert.equal(twice.blocks.length, once.blocks.length);
    assert.deepEqual(twice.blocks.map((block) => block.page), once.blocks.map((block) => block.page));
  });

  it("does not repeat inner-spread articles or images on wrapper pages", () => {
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
      images,
      clientName: "Trilogy Health Services",
      monthLabel: "June 2026",
    });

    const backText = wrapped.blocks
      .filter((block) => block.page === 4)
      .flatMap((block) => [block.heading, block.inlineText, block.caption])
      .filter(Boolean)
      .join("\n");
    assert.equal(/Happy Birthday|Mary Ann|Shirley/.test(backText), false);

    const wrapperImageIds = wrapped.blocks
      .filter((block) => block.page === 1 || block.page === 4)
      .map((block) => block.imageId)
      .filter(Boolean);
    assert.equal(wrapperImageIds.includes("i1"), false);

    const coverBirthday = wrapped.blocks.find((block) => block.blockId === "demo-cover-birthday");
    assert.equal(coverBirthday?.inlineText, "Residents and team members celebrating this month.");
    assert.equal(/Mary Ann|Shirley|7\/3|7\/10/.test(`${coverBirthday?.heading ?? ""}\n${coverBirthday?.inlineText ?? ""}`), false);
    assert.equal(wrapped.blocks.filter((block) => block.articleId === "birthday").length, 1);
  });
});
