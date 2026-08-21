import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import {
  buildPorterSourceUnits,
  classifyPorterSourceRole,
  isPorterScheduleArticle,
  porterBlocksAreAdjacent,
} from "../services/porterSourceSemantics.js";

function article(
  id: string,
  title: string,
  body: string,
  imageRefs: string[] = [],
  articleType: Article["articleType"] = "other",
): Article {
  return {
    id,
    title,
    body,
    imageRefs,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    source: "UPLOAD",
    isFiller: false,
    articleType,
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

function block(id: string, page: number, col: number, row: number, colSpan: number, rowSpan: number): LayoutBlock {
  return {
    blockId: id,
    slotId: id,
    page,
    position: { col, row, colSpan, rowSpan },
    kind: "article",
    needsFiller: false,
  };
}

describe("porterSourceSemantics", () => {
  it("classifies roles by source structure rather than names", () => {
    assert.equal(classifyPorterSourceRole(article("a", "From the Campus Leader", "hello", [], "executive-note")), "director-note");
    assert.equal(classifyPorterSourceRole(article("b", "Outings", "Residents took scenic trips.", ["Outings 1.jpg"])), "narrative-story");
    assert.equal(isPorterScheduleArticle(article("c", "Outings", "Residents took scenic trips.", ["Outings 1.jpg"])), false);
    assert.equal(isPorterScheduleArticle(article("d", "Whatever We Call It", "7/1 Music\n7/2 Breakfast\n7/3 Picnic")), true);
  });

  it("preserves list rows and explicit photo association confidence", () => {
    const units = buildPorterSourceUnits(
      [
        article("events", "Community Calendar", "7/1 Music; 7/2 Breakfast; 7/3 Picnic"),
        article("story", "Wings Project", "Residents worked with students.", ["Wings 1.jpg"]),
      ],
      [image("wings", "Wings 1.jpg")],
    );

    assert.equal(units[0].role, "dated-list");
    assert.equal(units[0].rows?.length, 3);
    assert.equal(units[1].role, "narrative-story");
    assert.equal(units[1].associationConfidence, "explicit");
  });

  it("uses edge adjacency instead of loose center distance for compounds", () => {
    const text = block("text", 1, 1, 1, 6, 4);
    const touchingPhoto = block("photo", 1, 7, 1, 4, 4);
    const samePageButDrifted = block("far", 1, 15, 8, 4, 4);
    assert.equal(porterBlocksAreAdjacent(text, touchingPhoto), true);
    assert.equal(porterBlocksAreAdjacent(text, samePageButDrifted), false);
  });
});

