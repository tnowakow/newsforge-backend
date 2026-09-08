import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AssembledLayout } from "@newsforge/shared/schemas";
import { wrapV3InnerSpreadForDemo } from "../services/fullNewsletterWrapper.js";

function layout(): AssembledLayout {
  return {
    templateId: "v3-spread-classic",
    pageCount: 2,
    blocks: [
      {
        blockId: "source-story",
        slotId: "source-story",
        page: 1,
        position: { col: 2, row: 3, colSpan: 10, rowSpan: 8 },
        kind: "article",
        articleId: "source-1",
        inlineText: "Exact source copy",
        heading: "Source heading",
        style: { bg: "cream", headerColor: "primary" },
        needsFiller: false,
      },
    ],
    unfilledSlotIds: [],
    stats: { placedArticles: 1, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
    version: 1,
  };
}

describe("campus-inner-spread contract", () => {
  it("keeps local geometry and content stable regardless of outer-page inputs", () => {
    const source = layout();
    const baseline = wrapV3InnerSpreadForDemo({ layout: source, articles: [], clientName: "Campus", monthLabel: "July" , layoutMode: "campus-inner-spread" });
    const withOuterInputs = wrapV3InnerSpreadForDemo({ layout: source, articles: [], images: [{ id: "outer", url: "https://example.com/outer.jpg", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" }], clientName: "Campus", monthLabel: "July", layoutMode: "campus-inner-spread" });
    assert.equal(baseline.pageCount, 2);
    assert.equal(baseline.logicalPageOffset, 1);
    assert.deepEqual(withOuterInputs.blocks, baseline.blocks);
    assert.equal(withOuterInputs.layoutMode, "campus-inner-spread");
  });

  it("separates local pages from logical newsletter pages with an explicit offset", () => {
    const result = wrapV3InnerSpreadForDemo({ layout: layout(), articles: [], clientName: "Campus", monthLabel: "July", layoutMode: "campus-inner-spread" });
    assert.deepEqual(result.blocks.map((block) => block.page), [1]);
    assert.deepEqual(result.blocks.map((block) => block.page + (result.logicalPageOffset ?? 0)), [2]);
  });
});
