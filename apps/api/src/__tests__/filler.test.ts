import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AssembledLayout, GridSpec } from "@newsforge/shared/schemas";

const gridSpec: GridSpec = {
  label: "birthday-placeholder-filler",
  columns: 12,
  rowsPerPage: 10,
  slots: [
    {
      id: "birthdays",
      page: 1,
      type: "list",
      col: 1,
      row: 1,
      colSpan: 6,
      rowSpan: 5,
      capacity: {},
      styleTag: "birthdays panel:sun",
    },
  ],
};

const layout: AssembledLayout = {
  templateId: "v3-editorial-light",
  pageCount: 1,
  version: 1,
  blocks: [
    {
      blockId: "birthdays",
      slotId: "birthdays",
      page: 1,
      position: { col: 1, row: 1, colSpan: 6, rowSpan: 5 },
      kind: "empty",
      styleTag: "birthdays panel:sun",
      needsFiller: true,
    },
  ],
  unfilledSlotIds: ["birthdays"],
  stats: { placedArticles: 0, placedImages: 0, fillerBlocks: 1, emptySlots: 1 },
};

describe("generateFiller", () => {
  it("uses client-fill placeholders for empty birthday slots even in generate mode", async () => {
    process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/newsforge_test";
    process.env.AI_UNLOCK_PASSWORD ??= "test-password";
    process.env.INTERNAL_RENDER_SECRET ??= "test-secret";
    const { generateFiller } = await import("../services/filler.js");
    const result = await generateFiller({
      layout,
      gridSpec,
      recurringSections: [],
      articles: [],
      brandVoice: "Warm",
      clientName: "Trilogy Health Services",
      monthLabel: "August 2026",
      mode: "GENERATE",
    });

    assert.equal(result.promptAudit, undefined);
    assert.equal(result.layout.blocks[0]?.kind, "filler");
    assert.equal(result.layout.blocks[0]?.heading, "Birthday List Placeholder");
    assert.match(result.layout.blocks[0]?.inlineText ?? "", /Client-fill area/);
    assert.equal(/Mary Ann|Shirley|Happy Birthday/.test(`${result.layout.blocks[0]?.heading}\n${result.layout.blocks[0]?.inlineText}`), false);
  });
});
