import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Article,
  AssembledLayout,
  GridSpec,
  LayoutBlock,
} from "@newsforge/shared/schemas";
import { evaluatePorterLayoutPlaybook } from "../services/porterLayoutPlaybook.js";

const gridSpec: GridSpec = {
  label: "playbook-test",
  columns: 24,
  rowsPerPage: 16,
  slots: [],
};

const articles: Article[] = [
  {
    id: "director",
    title: "Executive Director Corner",
    body: "A warm note for the month.",
    wordCount: 6,
    isFiller: false,
    source: "UPLOAD",
    articleType: "executive-note",
  },
  {
    id: "story",
    title: "Campus in Color",
    body: "Residents gathered for a creative afternoon.",
    wordCount: 7,
    isFiller: false,
    source: "UPLOAD",
    articleType: "resident-story",
  },
];

function block(
  id: string,
  page: number,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  options: Partial<LayoutBlock> = {},
): LayoutBlock {
  return {
    blockId: id,
    slotId: id,
    page,
    position: { col, row, colSpan, rowSpan },
    kind: options.imageId ? "image" : "article",
    needsFiller: false,
    zIndex: 0,
    ...options,
  };
}

function fourPageLayout(): AssembledLayout {
  const blocks = [
    block("cover-a", 1, 1, 1, 12, 16, { inlineText: "Static wrapper copy" }),
    block("cover-b", 1, 13, 1, 12, 16, { inlineText: "Static wrapper copy" }),
    block("director", 2, 1, 1, 10, 8, { articleId: "director", style: { panelRole: "directorCorner", bg: "cream" } }),
    block("inner-photo-a", 2, 11, 1, 14, 8, { imageId: "i1", caption: "Campus in Color" }),
    block("story", 2, 1, 9, 10, 8, { articleId: "story", style: { bg: "sky" } }),
    block("inner-photo-b", 3, 1, 1, 16, 16, { imageId: "i2", caption: "Residents creating art" }),
    block("inner-info", 3, 17, 1, 8, 16, { inlineText: "Community updates", style: { panelRole: "infoFooter", bg: "navy" } }),
    block("back-a", 4, 1, 1, 8, 8, { inlineText: "Looking Ahead" }),
    block("back-b", 4, 9, 1, 8, 8, { inlineText: "Save the Date" }),
    block("back-c", 4, 17, 1, 8, 8, { inlineText: "Thank You" }),
  ];
  return {
    templateId: "v3-panel-garden",
    pageCount: 4,
    blocks,
    unfilledSlotIds: [],
    stats: {
      placedArticles: blocks.filter((candidate) => candidate.articleId).length,
      placedImages: blocks.filter((candidate) => candidate.imageId).length,
      fillerBlocks: 0,
      emptySlots: 0,
    },
    version: 1,
  };
}

describe("evaluatePorterLayoutPlaybook", () => {
  it("grades white-space against inner pages for full demo newsletters", () => {
    const report = evaluatePorterLayoutPlaybook({
      layout: fourPageLayout(),
      articles,
      images: [],
      gridSpec,
      measurement: {
        candidateId: "selected",
        clippedBlocks: 0,
        clippedBlockIds: [],
        underfilledBlocks: 16,
        fillRatios: [],
        clipDetails: [],
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 2,
        placeholderImages: 0,
        realRenderedImages: 2,
        totalImages: 2,
        usefulOccupancy: 0.58,
        geometricCoverage: 0.96,
        minPageUtility: 0.22,
        largestEmptyBandRatio: 0,
        lowUtilityBlocks: 10,
        pageMetrics: [
          { page: 1, blockCount: 2, contentBlockCount: 2, imageBlocks: 0, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, placeholderImages: 0, renderFit: 1, usefulOccupancy: 0.25 },
          { page: 2, blockCount: 3, contentBlockCount: 3, imageBlocks: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, placeholderImages: 0, renderFit: 1, usefulOccupancy: 0.86 },
          { page: 3, blockCount: 2, contentBlockCount: 2, imageBlocks: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, placeholderImages: 0, renderFit: 1, usefulOccupancy: 0.98 },
          { page: 4, blockCount: 3, contentBlockCount: 3, imageBlocks: 0, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, placeholderImages: 0, renderFit: 1, usefulOccupancy: 0.22 },
        ],
      },
    });

    const whiteSpace = report.rules.find((rule) => rule.id === "white-space-repair");
    const renderedQuality = report.rules.find((rule) => rule.id === "rendered-quality-gate");
    assert.equal(whiteSpace?.status, "pass");
    assert.equal(renderedQuality?.status, "pass");
    assert.match(whiteSpace?.result ?? "", /Useful 92\.0%/);
  });
});
