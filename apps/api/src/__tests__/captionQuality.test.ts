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

test("uploaded filename captions are replaced with nearby story captions", () => {
  const articles: Article[] = [
    {
      id: "a-chef",
      title: "Chef Circle",
      body: "Chef Circle brought residents together for a hands-on culinary gathering with the dining team.",
      wordCount: 14,
      articleType: "announcement",
      isFiller: false,
      source: "UPLOAD",
    },
  ];
  const images: NewsImage[] = [
    {
      id: "img-chef",
      url: "https://example.com/chef.jpg",
      caption: "Chefs Circle.heic",
      aspect: "landscape",
      isPlaceholder: false,
      source: "UPLOAD",
    },
  ];
  const layout: AssembledLayout = {
    templateId: "v3-panel-garden",
    pageCount: 1,
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 1, placedImages: 1, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      articleBlock("chef-block", 1, "a-chef", { col: 1, row: 1, colSpan: 8, rowSpan: 4 }),
      imageBlock("chef-photo", 1, "img-chef", { col: 9, row: 1, colSpan: 6, rowSpan: 4 }),
    ],
  };

  const out = applyVibrancyPass({ layout, articles, images });
  const photo = out.blocks.find((b) => b.blockId === "chef-photo");
  assert.ok(photo?.caption);
  assert.match(photo!.caption!, /Chef Circle|culinary/i);
  assert.notEqual(photo!.caption, "Chefs Circle.heic");
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

test("photo clusters suppress captions and standalone photos de-duplicate captions per page", () => {
  const articles: Article[] = [{
    id: "a-story",
    title: "Summer Gathering",
    body: "Residents gathered outside for music and conversation. Staff shared refreshments and welcomed every neighbor.",
    wordCount: 14,
    articleType: "event-recap",
    isFiller: false,
    source: "MOCK",
  }];
  const images: NewsImage[] = [
    { id: "i-1", url: "https://example.com/1.jpg", caption: "A shared summer gathering", aspect: "landscape", isPlaceholder: false, source: "STOCK" },
    { id: "i-2", url: "https://example.com/2.jpg", caption: "A shared summer gathering", aspect: "landscape", isPlaceholder: false, source: "STOCK" },
    { id: "i-3", url: "https://example.com/3.jpg", caption: "A shared summer gathering", aspect: "landscape", isPlaceholder: false, source: "STOCK" },
  ];
  const layout: AssembledLayout = {
    templateId: "v3-spread-classic",
    pageCount: 1,
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 1, placedImages: 3, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      articleBlock("story", 1, "a-story", { col: 1, row: 1, colSpan: 8, rowSpan: 4 }),
      { ...imageBlock("cluster-1", 1, "i-1", { col: 9, row: 1, colSpan: 4, rowSpan: 4 }), styleTag: "photoCluster" },
      { ...imageBlock("cluster-2", 1, "i-2", { col: 13, row: 1, colSpan: 4, rowSpan: 4 }), styleTag: "photoCluster" },
      imageBlock("standalone", 1, "i-3", { col: 17, row: 1, colSpan: 4, rowSpan: 4 }),
    ],
  };
  const out = applyVibrancyPass({ layout, articles, images });
  assert.equal(out.blocks.find((b) => b.blockId === "cluster-1")?.caption, undefined);
  assert.equal(out.blocks.find((b) => b.blockId === "cluster-2")?.caption, undefined);
  assert.ok(out.blocks.find((b) => b.blockId === "standalone")?.caption);
});

test("short schedule lists become narrow rails and oversized articles split below the page ceiling", () => {
  const articles: Article[] = [{
    id: "a-long",
    title: "Living Together",
    body: "Residents built a stronger community through shared meals and thoughtful conversations. The team created new activities for neighbors to enjoy together. Families joined the celebration and made the afternoon memorable.",
    wordCount: 40,
    articleType: "resident-story",
    isFiller: false,
    source: "MOCK",
  }, {
    id: "a-happy",
    title: "Happy Hour",
    body: "7/1 Music and Mocktails\n7/8 Garden Social\n7/15 Patio Trivia\n7/22 Ice Cream Bar\n7/29 Summer Singalong",
    wordCount: 15,
    articleType: "announcement",
    isFiller: false,
    source: "MOCK",
  }];
  const layout: AssembledLayout = {
    templateId: "v3-spread-classic",
    pageCount: 1,
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 2, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      articleBlock("long", 1, "a-long", { col: 1, row: 1, colSpan: 24, rowSpan: 8 }),
      { ...articleBlock("happy", 1, "a-happy", { col: 1, row: 9, colSpan: 20, rowSpan: 4 }), kind: "list", listItems: [
        { label: "7/1", value: "Music and Mocktails" },
        { label: "7/8", value: "Garden Social" },
        { label: "7/15", value: "Patio Trivia" },
        { label: "7/22", value: "Ice Cream Bar" },
        { label: "7/29", value: "Summer Singalong" },
      ], style: { panelRole: "happyHour" } },
    ],
  };
  const out = applyVibrancyPass({ layout, articles, images: [], gridSpec: { columns: 24, rowsPerPage: 16 } });
  const happy = out.blocks.find((b) => b.blockId === "happy");
  assert.ok((happy?.position.colSpan ?? 99) <= 6);
  const articlePieces = out.blocks.filter((b) => b.blockId.startsWith("long"));
  assert.ok(articlePieces.length >= 2);
  assert.ok(articlePieces.every((b) => b.position.colSpan * b.position.rowSpan <= 24 * 16 * 0.24));
});
