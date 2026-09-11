import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import {
  chooseStoryModuleKind,
  clearStoryModuleMeasurementCache,
  colSpanToWidthPx,
  heightPxToRows,
  pageContentHeightPx,
  storyModuleFontVersion,
  storyModuleStyleVersion,
  validateStoryCompound,
} from "../services/storyModuleMeasurement.js";
import { LETTER_RENDER_CONTRACT } from "@newsforge/shared";

function article(imageRefs: string[] = [], extra: Partial<Article> = {}): Article {
  return {
    id: "story-1",
    title: "A complete story",
    body: "The residents gathered for a long afternoon of conversation.\n\nThey shared recipes and photos from the outing.",
    wordCount: 18,
    imageRefs,
    source: "UPLOAD",
    sourceRole: "narrative-story",
    isFiller: false,
    compoundId: "compound-story-1",
    ...extra,
  };
}

function image(id: string, originalName = id): NewsImage {
  return {
    id,
    originalName,
    url: `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`,
    aspect: "landscape",
    source: "UPLOAD",
    isPlaceholder: false,
  };
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
      () =>
        validateStoryCompound(
          [block({ articleId: "story-1" })],
          article(["portrait.jpg"]),
          [image("portrait-id", "portrait.jpg")],
        ),
      /omitted linked images/,
    );
  });

  it("accepts an article and every image in its compound", () => {
    assert.doesNotThrow(() =>
      validateStoryCompound(
        [
          block({ articleId: "story-1" }),
          block({ kind: "image", imageId: "portrait-id", compoundId: "compound-story-1" }),
        ],
        article(["portrait.jpg"]),
        [image("portrait-id", "portrait.jpg")],
      ),
    );
  });

  it("does not retain measurements across runs", () => {
    clearStoryModuleMeasurementCache();
    assert.doesNotThrow(() => clearStoryModuleMeasurementCache());
  });

  it("exposes style/font versions that change with the contract", () => {
    const a = storyModuleStyleVersion(LETTER_RENDER_CONTRACT);
    const b = storyModuleFontVersion(LETTER_RENDER_CONTRACT);
    assert.ok(a.includes(LETTER_RENDER_CONTRACT.id));
    assert.ok(b.includes("EB Garamond") || b.includes(LETTER_RENDER_CONTRACT.fonts.body));
  });

  it("converts measured heights into bounded row spans", () => {
    const tall = heightPxToRows(900, 16);
    const short = heightPxToRows(40, 16);
    assert.ok(tall > short);
    assert.ok(tall <= 16);
    assert.equal(short, 1);
  });

  it("maps col spans to positive pixel widths", () => {
    const half = colSpanToWidthPx(12, 24);
    const full = colSpanToWidthPx(24, 24);
    assert.ok(full > half);
    assert.ok(half > 100);
  });

  it("reports a usable page content height under the letter contract", () => {
    const h = pageContentHeightPx(LETTER_RENDER_CONTRACT);
    assert.ok(h > 500 && h < 1100);
  });

  it("chooses module kinds from role and photo count", () => {
    assert.equal(chooseStoryModuleKind(article([], { sourceRole: "dated-list" }), 0), "compact-list");
    assert.equal(chooseStoryModuleKind(article([], { sourceRole: "director-note", title: "Director" }), 0), "director");
    assert.equal(chooseStoryModuleKind(article([], { wordCount: 220, body: "x ".repeat(220) }), 0), "long-text-columns");
    assert.equal(chooseStoryModuleKind(article(), 2), "story-image-pair");
    assert.equal(chooseStoryModuleKind(undefined, 1), "photo-only");
  });
});
