import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LETTER_RENDER_CONTRACT } from "@newsforge/shared";
import type { Article, AssembledLayout, GridSpec } from "@newsforge/shared/schemas";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.AI_UNLOCK_PASSWORD ??= "test";
process.env.INTERNAL_RENDER_SECRET ??= "test";

const { measureFinalLayout } = await import("../services/layoutMeasurementService.js");
const { shutdownBrowser } = await import("../browser.js");

const gridSpec: GridSpec = { label: "artifact-gate", columns: 12, rowsPerPage: 16, slots: [] };
const brandKit = {
  primaryColor: "#1b365d",
  secondaryColor: "#6fae6b",
  accentColor: "#e8762c",
  headingFont: LETTER_RENDER_CONTRACT.fonts.heading,
  bodyFont: LETTER_RENDER_CONTRACT.fonts.body,
  logoUrl: null,
};

function article(id: string, title: string, ending: string): Article {
  const body = `${Array.from({ length: 150 }, (_, index) => `word${index}`).join(" ")} ${ending}`;
  return { id, title, body, wordCount: 151, source: "UPLOAD", isFiller: false };
}

function layout(): AssembledLayout {
  return {
    templateId: "v3-artifact-gate-fixture",
    layoutMode: "campus-inner-spread",
    logicalPageOffset: 1,
    pageCount: 2,
    version: 3,
    unfilledSlotIds: [],
    stats: { placedArticles: 2, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
    blocks: [
      {
        blockId: "director",
        slotId: "director",
        kind: "article",
        page: 1,
        articleId: "director-article",
        needsFiller: false,
        position: { col: 1, row: 1, colSpan: 6, rowSpan: 1 },
        style: { bg: "paper", panelRole: "directorCorner" },
      },
      {
        blockId: "chef",
        slotId: "chef",
        kind: "article",
        page: 2,
        articleId: "chef-article",
        needsFiller: false,
        position: { col: 1, row: 1, colSpan: 6, rowSpan: 1 },
        style: { bg: "paper" },
      },
    ],
  };
}

describe("final layout DOM evidence", () => {
  it("detects ancestor-clipped director and Chef endings despite source JSON", async () => {
    const result = await measureFinalLayout({
      clientName: "Trilogy",
      monthLabel: "July 2026",
      brandKit,
      gridSpec,
      articles: [
        article("director-article", "Executive Director Corner", "DIRECTOR-END"),
        article("chef-article", "Chef Spotlight", "CHEF-END"),
      ],
      images: [],
      recurringSections: [],
      layout: layout(),
    });
    assert.equal(result.status, "passed", JSON.stringify(result));
    if (result.status !== "passed") return;
    assert.ok(result.measurement.clippedBlockIds?.includes("director"));
    assert.ok(result.measurement.clippedBlockIds?.includes("chef"));
    assert.equal(result.measurement.sourceTextMissing?.length, 0);
    assert.ok((result.measurement.minBodyFontPt ?? 0) > 0);
    assert.ok((result.measurement.effectiveFonts?.length ?? 0) > 0);
  });

  it("marks an unplaced immutable source article as missing visible copy", async () => {
    const visible = article("director-article", "Executive Director Corner", "DIRECTOR-END");
    const unplaced = article("anniversary", "Anniversary", "ANNIVERSARY-END");
    const oneBlockLayout = layout();
    oneBlockLayout.blocks = oneBlockLayout.blocks.slice(0, 1);
    oneBlockLayout.stats.placedArticles = 1;
    const result = await measureFinalLayout({
      clientName: "Trilogy",
      monthLabel: "July 2026",
      brandKit,
      gridSpec,
      articles: [visible, unplaced],
      images: [],
      recurringSections: [],
      layout: oneBlockLayout,
    });
    assert.equal(result.status, "passed", JSON.stringify(result));
    if (result.status !== "passed") return;
    assert.ok(result.measurement.sourceTextMissing?.includes("article:anniversary:unplaced"));
  });

  it("shuts down Chromium", async () => {
    await shutdownBrowser();
  });
});
