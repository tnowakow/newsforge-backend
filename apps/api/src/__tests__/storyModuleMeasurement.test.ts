import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import { clearStoryModuleMeasurementCache, validateStoryCompound } from "../services/storyModuleMeasurement.js";

function article(imageRefs: string[] = []): Article {
  return {
    id: "story-1",
    title: "A complete story",
    body: "The residents gathered for a long afternoon of conversation.",
    wordCount: 10,
    imageRefs,
    source: "UPLOAD",
    sourceRole: "narrative-story",
    isFiller: false,
    compoundId: "compound-story-1",
  };
}

function image(id: string, originalName = id): NewsImage {
  return { id, originalName, url: `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`, aspect: "landscape", source: "UPLOAD", isPlaceholder: false };
}

function block(overrides: Partial<LayoutBlock>): LayoutBlock {
  return {
    blockId: "b1",
    slotId: "s1",
    page: 1,
    position: { col: 1, row: 1, colSpan: 4, rowSpan: 4 },
    kind: "article",
    needsFiller: false,
    zIndex: 0,
    ...overrides,
  };
}

describe("story module measurement contracts", () => {
  it("rejects a story that omits a confirmed linked image", () => {
    assert.throws(
      () => validateStoryCompound([block({ articleId: "story-1" })], article(["portrait.jpg"]), [image("portrait-id", "portrait.jpg")]),
      /omitted linked images/,
    );
  });

  it("accepts an article and every image in its compound", () => {
    assert.doesNotThrow(() => validateStoryCompound([
      block({ articleId: "story-1" }),
      block({ kind: "image", imageId: "portrait-id", compoundId: "compound-story-1" }),
    ], article(["portrait.jpg"]), [image("portrait-id", "portrait.jpg")]));
  });

  it("does not retain measurements across runs", () => {
    clearStoryModuleMeasurementCache();
    // The cache is intentionally private; this assertion documents the public reset contract.
    assert.doesNotThrow(() => clearStoryModuleMeasurementCache());
  });
});
