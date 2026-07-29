import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, GridSpec, NewsImage, TemplateSlot } from "@newsforge/shared/schemas";
import {
  selectStockPhotosForRun,
  stockCatalogSize,
} from "../services/stockPhotoCatalog.js";

function slot(
  id: string,
  page: number,
  type: TemplateSlot["type"],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  aspect?: "square" | "portrait" | "landscape",
  styleTag?: string,
): TemplateSlot {
  return {
    id,
    page,
    type,
    col,
    row,
    colSpan,
    rowSpan,
    capacity: aspect ? { aspect } : {},
    styleTag,
  };
}

const gridSpec: GridSpec = {
  label: "v3-spread-classic",
  columns: 24,
  rowsPerPage: 16,
  slots: [
    slot("happy-photo", 1, "image", 1, 1, 6, 4, "landscape", "happy-hour photo-cluster"),
    slot("smile-photo", 1, "image", 7, 1, 5, 5, "portrait", "smile-of-the-month hero-portrait"),
    slot("outing-photo", 1, "image", 13, 1, 6, 4, "landscape", "out-and-about caption"),
  ],
};

const articles: Article[] = [
  {
    id: "a-happy",
    title: "Happy Hour",
    body: "Residents are gathering for weekly happy hour with refreshing drinks, snacks, music, and neighbors.",
    wordCount: 13,
    isFiller: false,
    source: "MOCK",
    articleType: "announcement",
  },
  {
    id: "a-smile",
    title: "Smile of the Month",
    body: "Meet this month's resident spotlight and learn about the smile she brings to campus.",
    wordCount: 13,
    isFiller: false,
    source: "MOCK",
    articleType: "resident-story",
  },
  {
    id: "a-outing",
    title: "Out and About",
    body: "Upcoming trips include a park outing, shopping trip, and lunch in town.",
    wordCount: 12,
    isFiller: false,
    source: "MOCK",
    articleType: "announcement",
  },
];

describe("stockPhotoCatalog", () => {
  it("contains a large enough curated demo catalog", () => {
    assert.ok(stockCatalogSize() >= 80);
  });

  it("replaces generated demo placeholders with described stock images", () => {
    const images: NewsImage[] = [
      {
        id: "placeholder",
        url: "https://example.com/placeholder.jpg",
        caption: "generic",
        aspect: "landscape",
        isPlaceholder: false,
        source: "MOCK",
      },
    ];

    const selected = selectStockPhotosForRun({ articles, images, gridSpec });

    assert.equal(selected.some((img) => img.id === "placeholder"), false);
    assert.ok(selected.length >= 8);
    assert.ok(selected.every((img) => img.source === "STOCK"));
    assert.ok(selected.every((img) => img.description && img.description.length > 30));
    assert.ok(selected.every((img) => (img.tags ?? []).length >= 4));
    assert.ok(selected.some((img) => (img.tags ?? []).includes("happy hour")));
    assert.ok(selected.some((img) => (img.tags ?? []).includes("resident")));
  });

  it("preserves uploaded images and only fills the remaining slots", () => {
    const upload: NewsImage = {
      id: "upload-1",
      url: "/uploads/photo.jpg",
      caption: "Family submitted photo",
      aspect: "landscape",
      isPlaceholder: false,
      source: "UPLOAD",
    };

    const selected = selectStockPhotosForRun({
      articles,
      images: [upload],
      gridSpec,
    });

    assert.equal(selected[0].id, "upload-1");
    assert.ok(selected.length >= 8);
    assert.ok(selected.slice(1).every((img) => img.source === "STOCK"));
  });
});
