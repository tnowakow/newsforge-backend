import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, GridSpec, NewsImage } from "@newsforge/shared/schemas";
import { composeInnerSpread } from "../services/innerSpreadComposer.js";

const gridSpec: GridSpec = { label: "inner", columns: 24, rowsPerPage: 16, slots: [] };
function article(id: string, words: number, imageRefs: string[] = []): Article {
  const body = Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
  return { id, title: `Story ${id}`, body, wordCount: words, source: "UPLOAD", imageRefs, isFiller: false };
}
function image(id: string, originalName: string): NewsImage {
  return { id, url: `/uploads/${originalName}`, originalName, aspect: "landscape", source: "UPLOAD", isPlaceholder: false };
}

describe("inner spread composer", () => {
  it("returns two pages with complete source/photo coverage and no overlap", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 50, ["a.jpg"]), article("b", 30, ["b.jpg"]), article("c", 20)],
      images: [image("ia", "a.jpg"), image("ib", "b.jpg")],
      contract: { gridSpec },
    });
    assert.equal(result.status, "fit");
    assert.equal(result.layout.pageCount, 2);
    assert.deepEqual(result.omittedRequiredUnitIds, []);
    assert.deepEqual(result.unresolvedRequiredPhotoRefs, []);
    assert.deepEqual(result.contentEdits, []);
    assert.ok(result.pages.every((page) => page.clipCount === 0 && page.overlapCount === 0));
    assert.equal(result.provider, "deterministic");
  });

  it("does not resolve an unconfirmed photo reference or claim fit", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 20, ["missing.jpg"])], images: [], contract: { gridSpec },
    });
    assert.equal(result.status, "overflow");
    assert.deepEqual(result.unresolvedRequiredPhotoRefs, ["missing.jpg"]);
    assert.equal(result.overflow?.reason, "required photo references are unresolved");
  });

  it("reports constrained overflow instead of dropping required source units", async () => {
    const result = await composeInnerSpread({
      source: Array.from({ length: 10 }, (_, i) => article(String(i), 500)), images: [], contract: { gridSpec },
    });
    assert.equal(result.status, "overflow");
    assert.ok(result.omittedRequiredUnitIds.length > 0);
    assert.equal(result.contentEdits.length, 0);
  });
});
