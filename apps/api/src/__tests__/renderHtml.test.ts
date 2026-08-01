import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Article,
  AssembledLayout,
  GridSpec,
  NewsImage,
} from "@newsforge/shared/schemas";
import { renderRunHtml } from "../services/renderHtml.js";

const gridSpec: GridSpec = {
  label: "render-test",
  columns: 12,
  rowsPerPage: 10,
  slots: [],
};

const articles: Article[] = [
  {
    id: "a1",
    title: "Out and About",
    body: "Residents headed out for lunch, music, and a sunny afternoon together.",
    wordCount: 11,
    isFiller: false,
    source: "MOCK",
    articleType: "announcement",
  },
];

const images: NewsImage[] = [
  {
    id: "i1",
    url: "https://example.com/photo.jpg",
    caption: "A bright event moment",
    aspect: "landscape",
    isPlaceholder: false,
    source: "STOCK",
  },
];

function layout(templateId: string): AssembledLayout {
  return {
    templateId,
    pageCount: 1,
    visualPersonality: templateId === "v3-photo-festival" ? undefined : "celebration-pop",
    version: 1,
    unfilledSlotIds: [],
    stats: { placedArticles: 1, placedImages: 1, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      {
        blockId: "b1",
        slotId: "s1",
        page: 1,
        kind: "article",
        articleId: "a1",
        needsFiller: false,
        position: { col: 1, row: 1, colSpan: 6, rowSpan: 4 },
        style: { panelRole: "outingList", headerColor: "coral", compact: true },
      },
      {
        blockId: "i1",
        slotId: "s2",
        page: 1,
        kind: "image",
        imageId: "i1",
        caption: "A bright event moment",
        needsFiller: false,
        position: { col: 7, row: 1, colSpan: 6, rowSpan: 4 },
        style: { photoTreatment: "wide" },
      },
    ],
  };
}

describe("renderRunHtml personality classes", () => {
  it("adds template-specific visual personality classes to print pages", () => {
    const html = renderRunHtml({
      clientName: "Trilogy Health Services",
      monthLabel: "July 2026",
      brandKit: {
        primaryColor: "#1B365D",
        secondaryColor: "#6FAE6B",
        accentColor: "#E8762C",
        headingFont: "Georgia",
        bodyFont: "Georgia",
        logoUrl: null,
      },
      gridSpec,
      layout: layout("v3-photo-festival"),
      articles,
      images,
      recurringSections: [],
    });

    assert.match(html, /class="page personality-photo-festival"/);
    assert.match(html, /personality-photo-festival \.masthead/);
    assert.match(html, /class="block role-outingList"/);
    assert.match(html, /class="photo photo-wide"/);
  });

  it("uses layout visual personality ahead of template fallback", () => {
    const html = renderRunHtml({
      clientName: "Trilogy Health Services",
      monthLabel: "July 2026",
      brandKit: {
        primaryColor: "#1B365D",
        secondaryColor: "#6FAE6B",
        accentColor: "#E8762C",
        headingFont: "Georgia",
        bodyFont: "Georgia",
        logoUrl: null,
      },
      gridSpec,
      layout: layout("v3-spread-classic"),
      articles,
      images,
      recurringSections: [],
    });

    assert.match(html, /class="page personality-celebration-pop"/);
    assert.match(html, /personality-celebration-pop \.masthead/);
  });
});
