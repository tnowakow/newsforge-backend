import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, AssembledLayout, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import { evaluatePorterLayoutInvariants } from "../services/porterLayoutInvariants.js";
import { evaluateQualityGate } from "../services/qualityGate.js";

function article(id: string, title: string, body: string, imageRefs: string[] = []): Article {
  return {
    id,
    title,
    body,
    imageRefs,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    source: "UPLOAD",
    isFiller: false,
    articleType: "other",
  };
}

function image(id: string, caption: string): NewsImage {
  return {
    id,
    url: `/uploads/${caption}`,
    caption,
    aspect: "landscape",
    source: "UPLOAD",
    isPlaceholder: false,
  };
}

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
    ...options,
  };
}

function layout(blocks: LayoutBlock[]): AssembledLayout {
  return {
    templateId: "test",
    pageCount: 2,
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

describe("porterLayoutInvariants", () => {
  it("blocks a sparse four-page source packet before it becomes an empty-looking export", () => {
    const report = evaluatePorterLayoutInvariants({
      layout: layout([
        block("director", 1, 1, 1, 8, 5, { articleId: "director" }),
        block("legacy", 2, 1, 1, 8, 5, { articleId: "legacy" }),
        block("events", 2, 10, 1, 8, 5, { articleId: "events", kind: "list", listItems: [] }),
      ]),
      articles: [
        article("director", "Executive Director Corner", "A director note with useful content."),
        article("legacy", "Legacy News", "A resident story with useful content."),
        article("events", "July Entertainment", "2nd Country Gentlemen\n3rd Don Smithey"),
      ],
      images: [],
    });

    assert.equal(report.passed, false);
    assert.match(report.hardFailures.join(" "), /source-packet-insufficient/);
  });

  it("fails photo-only pages and lets the quality gate block a high score", () => {
    const report = evaluatePorterLayoutInvariants({
      layout: layout([
        block("story", 1, 1, 1, 8, 6, { articleId: "story" }),
        block("photo-a", 2, 1, 1, 8, 8, { imageId: "i1" }),
      ]),
      articles: [article("story", "Wings Project", "Residents worked with students.")],
      images: [image("i1", "Wings 1.jpg")],
    });

    assert.equal(report.passed, false);
    assert.match(report.hardFailures.join(" "), /photo-only-inner-page/);
    const gate = evaluateQualityGate(0.91, 0.6, report.hardFailures);
    assert.equal(gate.passed, false);
    assert.match(gate.reason ?? "", /Hard Porter invariant failed/);
  });

  it("requires explicit associated photos to be adjacent", () => {
    const story = article("story", "Wings Project", "Residents worked with students.", ["Wings 1.jpg"]);
    const report = evaluatePorterLayoutInvariants({
      layout: layout([
        block("story", 1, 1, 1, 6, 4, { articleId: "story" }),
        block("photo", 1, 18, 10, 5, 4, { imageId: "i1", caption: "Wings Project" }),
      ]),
      articles: [story],
      images: [image("i1", "Wings 1.jpg")],
    });

    assert.equal(report.passed, false);
    assert.match(report.hardFailures.join(" "), /source-photo-not-adjacent/);
  });

  it("treats unmatched photo refs as visible warnings, not certified pairings", () => {
    const story = article("story", "Wings Project", "Residents worked with students.", ["Wings 1.jpg"]);
    const report = evaluatePorterLayoutInvariants({
      layout: layout([
        block("story", 1, 1, 1, 6, 4, { articleId: "story" }),
        block("photo", 1, 7, 1, 5, 4, { imageId: "i1", caption: "Wings Project" }),
      ]),
      articles: [story],
      images: [image("i1", "generic-photo.jpg")],
    });

    assert.equal(report.passed, true);
    assert.match(report.warnings.join(" "), /source-photo-unresolved/);
  });
});
