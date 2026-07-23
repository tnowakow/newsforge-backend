import assert from "node:assert/strict";
import test from "node:test";
import type { AssembledLayout } from "@newsforge/shared/schemas";

test("AI layout normalization repairs missing slot ids from Gemini blocks", async () => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/newsforge";
  process.env.AI_UNLOCK_PASSWORD ??= "test-password";
  process.env.INTERNAL_RENDER_SECRET ??= "test-secret";
  const { normalizeAiLayoutBlocks } = await import("../services/aiLayoutDesigner.js");

  const skeleton: AssembledLayout = {
    templateId: "v3-panel-garden",
    pageCount: 2,
    version: 1,
    unfilledSlotIds: [],
    stats: {
      placedArticles: 0,
      placedImages: 0,
      fillerBlocks: 0,
      emptySlots: 0,
    },
    blocks: [
      {
        blockId: "hero-photo",
        slotId: "slot-hero-photo",
        page: 1,
        position: { col: 1, row: 1, colSpan: 6, rowSpan: 5 },
        kind: "image",
        imageId: "img-1",
        needsFiller: false,
      },
    ],
  };

  const normalized = normalizeAiLayoutBlocks(
    [
      {
        blockId: "hero-photo",
        page: 1,
        position: { col: 1, row: 1, colSpan: 6, rowSpan: 5 },
        kind: "image",
        imageId: "img-1",
        needsFiller: false,
      },
    ],
    skeleton,
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.slotId, "slot-hero-photo");
});
