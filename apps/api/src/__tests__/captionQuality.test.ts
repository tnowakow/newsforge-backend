import assert from "node:assert/strict";
import test from "node:test";
import type { Article, AssembledLayout, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import { applyVibrancyPass } from "../services/vibrancyPass.js";

function articleBlock(
  blockId: string,
  page: number,
  articleId: string,
  position: LayoutBlock["position"],
): LayoutBlock {
  return {
    blockId,
    slotId: blockId,
    page,
    position,
    kind: "article",
    articleId,
    needsFiller: false,
  };
}

function imageBlock(
  blockId: string,
  page: number,
  imageId: string,
  position: LayoutBlock["position"],
): LayoutBlock {
  return {
    blockId,
    slotId: blockId,
    page,
    position,
    kind: "image",
    imageId,
    needsFiller: false,
  };
}

test("image caption derives from the nearest narrative article, not a generic stock caption", () => {
  const articles: Article[] = [
    {
      id: "a-carwash",
      title: "Scrubbly Bubbly Car Wash",
      body: "Residents rolled up their sleeves for the Scrubbly Bubbly Car Wash, soaking friends and staff in a summer-long water fight.",
      wordCount: 20,
      articleType: "event-recap",
      isFiller: false,
      source: "MOCK",
    },
    {
      id: "a-birthday",
      title: "Happy Birthday!",
      body: "RESIDENTS\nMary Ann F. 7/3\nShirley S. 7/10",
      wordCount: 6,
      articleType: "birthday",
      isFiller: false,
      source: "MOCK",
    },
  ];
  const images: NewsImage[] = [
    {
      id: "img-1",
      url: "https://example.com/photo.jpg",
      caption: "A relaxed happy hour table ready for friends", // generic stock caption
      aspect: "landscape",
      isPlaceholder: false,
      source: "STOCK",
    },
  ];

  const layout: AssembledLayout = {
    templateId: "v3-spread-classic",
    pageCount: 1,
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 2, placedImages: 1, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      articleBlock("carwash-block", 1, "a-carwash", { col: 1, row: 1, colSpan: 12, rowSpan: 4 }),
      // Photo sits directly beside the car wash article, far from the birthday list.
      imageBlock("photo-block", 1, "img-1", { col: 13, row: 1, colSpan: 6, rowSpan: 4 }),
      articleBlock("birthday-block", 1, "a-birthday", { col: 1, row: 12, colSpan: 6, rowSpan: 4 }),
    ],
  };

  const out = applyVibrancyPass({ layout, articles, images });
  const photo = out.blocks.find((b) => b.blockId === "photo-block");
  assert.ok(photo?.caption, "caption should be set");
  // Should be grounded in the nearby car wash story, not the generic stock caption or the birthday module.
  assert.match(photo!.caption!, /car wash|scrubbly/i);
  assert.notEqual(photo!.caption, "A relaxed happy hour table ready for friends");
});

test("real uploaded photos with a real caption are never overwritten by nearby-article inference", () => {
  const articles: Article[] = [
    {
      id: "a-feature",
      title: "Summer Concert Series",
      body: "The community kicked off its outdoor concert series with a full house on the lawn.",
      wordCount: 15,
      articleType: "event-recap",
      isFiller: false,
      source: "MOCK",
    },
  ];
  const images: NewsImage[] = [
    {
      id: "img-upload",
      url: "https://example.com/upload.jpg",
      caption: "Grandma Joan celebrating her 90th birthday with the whole family",
      aspect: "landscape",
      isPlaceholder: false,
      source: "UPLOAD",
    },
  ];
  const layout: AssembledLayout = {
    templateId: "v3-spread-classic",
    pageCount: 1,
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 1, placedImages: 1, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      articleBlock("feature-block", 1, "a-feature", { col: 1, row: 1, colSpan: 12, rowSpan: 4 }),
      imageBlock("photo-block", 1, "img-upload", { col: 13, row: 1, colSpan: 6, rowSpan: 4 }),
    ],
  };

  const out = applyVibrancyPass({ layout, articles, images });
  const photo = out.blocks.find((b) => b.blockId === "photo-block");
  assert.equal(photo?.caption, "Grandma Joan celebrating her 90th birthday with the whole family");
});

test("captions never pull from a nearby birthday/schedule list block", () => {
  const articles: Article[] = [
    {
      id: "a-birthday",
      title: "Happy Birthday!",
      body: "RESIDENTS\nMary Ann F. 7/3\nShirley S. 7/10",
      wordCount: 6,
      articleType: "birthday",
      isFiller: false,
      source: "MOCK",
    },
  ];
  const images: NewsImage[] = [
    {
      id: "img-1",
      url: "https://example.com/photo.jpg",
      aspect: "landscape",
      isPlaceholder: false,
      source: "STOCK",
    },
  ];
  const layout: AssembledLayout = {
    templateId: "v3-spread-classic",
    pageCount: 1,
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 1, placedImages: 1, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      articleBlock("birthday-block", 1, "a-birthday", { col: 1, row: 1, colSpan: 6, rowSpan: 4 }),
      imageBlock("photo-block", 1, "img-1", { col: 7, row: 1, colSpan: 6, rowSpan: 4 }),
    ],
  };

  const out = applyVibrancyPass({ layout, articles, images });
  const photo = out.blocks.find((b) => b.blockId === "photo-block");
  // No narrative article nearby (only the birthday list) — falls back to the
  // generic default rather than pulling "RESIDENTS / Mary Ann F. 7/3" nonsense.
  assert.equal(photo?.caption, "A wonderful moment around campus!");
});
