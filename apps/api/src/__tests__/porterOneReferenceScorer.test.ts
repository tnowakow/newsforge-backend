import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  AssembledLayout,
  GridSpec,
  LayoutBlock,
} from "@newsforge/shared/schemas";
import {
  porterOneReferenceIdForTemplate,
  porterOneTemplateForScenario,
  scorePorterOneReferenceAffinity,
  scoreFullNewsletterOutput,
} from "../services/porterOneReferenceScorer.js";

const gridSpec: GridSpec = {
  label: "porter-reference-test",
  columns: 24,
  rowsPerPage: 16,
  slots: [],
};

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

function layout(blocks: LayoutBlock[]): AssembledLayout {
  return {
    templateId: "reference-test",
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

describe("porterOneReferenceScorer", () => {
  it("maps each supplied reference scenario to its matching PorterOne grammar", () => {
    assert.equal(porterOneTemplateForScenario("community-classic"), "v3-spread-classic");
    assert.equal(porterOneTemplateForScenario("panel-garden"), "v3-panel-garden");
    assert.equal(porterOneTemplateForScenario("photo-festival"), "v3-photo-festival");
    assert.equal(porterOneTemplateForScenario("resident-feature"), "v3-resident-feature");
    assert.equal(porterOneTemplateForScenario("editorial-light"), "v3-editorial-light");
    assert.equal(porterOneTemplateForScenario(), undefined);
  });

  it("assigns each seeded spread to its intended reference family", () => {
    assert.equal(porterOneReferenceIdForTemplate("v3-spread-classic"), "example1-gateway-collage");
    assert.equal(porterOneReferenceIdForTemplate("v3-panel-garden"), "example3-dense-lavender-grid");
    assert.equal(porterOneReferenceIdForTemplate("v3-resident-feature"), "example2-photo-rails");
    assert.equal(porterOneReferenceIdForTemplate("v3-photo-festival"), "example5-feature-band");
    assert.equal(porterOneReferenceIdForTemplate("v3-editorial-light"), "example4-editorial-rail");
  });

  it("rewards dense colored PorterOne-style collage layouts", () => {
    const score = scorePorterOneReferenceAffinity(layout([
      block("photo-1", 1, 1, 1, 4, 7, { imageId: "i1", style: { photoTreatment: "portrait" } }),
      block("director", 1, 5, 1, 8, 7, { articleId: "a1", style: { bg: "cream", panelRole: "directorCorner" } }),
      block("birthday", 1, 13, 1, 5, 4, { articleId: "a2", kind: "list", style: { bg: "sun", panelRole: "birthday" } }),
      block("events", 1, 18, 1, 7, 5, { articleId: "a3", style: { bg: "coral", panelRole: "upcomingEvents" } }),
      block("photo-2", 1, 13, 5, 5, 5, { imageId: "i2", style: { photoTreatment: "rounded" } }),
      block("happy", 1, 18, 6, 7, 4, { articleId: "a4", style: { bg: "navy", invertText: true, panelRole: "happyHour" } }),
      block("photo-3", 1, 1, 8, 6, 9, { imageId: "i3", style: { photoTreatment: "collage" } }),
      block("photo-4", 1, 7, 8, 6, 4, { imageId: "i4", style: { photoTreatment: "collage" } }),
      block("feature", 1, 13, 10, 12, 7, { articleId: "a5", style: { bg: "sky", panelRole: "featureBand" } }),
      block("rail", 2, 1, 1, 4, 16, { imageId: "i5", style: { photoTreatment: "stacked" } }),
      block("outing", 2, 5, 1, 8, 9, { articleId: "a6", kind: "list", style: { bg: "berry", panelRole: "outingList" } }),
      block("spotlight", 2, 13, 1, 7, 11, { articleId: "a7", style: { bg: "blush", panelRole: "spotlightRail" } }),
      block("photo-5", 2, 20, 1, 5, 6, { imageId: "i6", style: { photoTreatment: "portrait" } }),
      block("volunteer", 2, 20, 7, 5, 5, { articleId: "a8", style: { bg: "leaf", panelRole: "volunteerCallout" } }),
      block("footer", 2, 5, 13, 20, 4, { articleId: "a9", style: { bg: "navy", invertText: true, panelRole: "infoFooter" } }),
    ]), gridSpec);

    assert.ok(score.affinity >= 0.78, `expected high affinity, got ${score.affinity}`);
    assert.ok(score.referenceId.startsWith("example"));
    assert.ok(score.diagnostics.imageBlockCount >= 6);
    assert.ok(score.diagnostics.colorPanelAreaRatio > 0.35);
  });

  it("penalizes sparse template-like layouts even when they fill the page", () => {
    const score = scorePorterOneReferenceAffinity(layout([
      block("hero", 1, 1, 1, 24, 8, { articleId: "a1", style: { bg: "cream" } }),
      block("photo", 1, 1, 9, 24, 8, { imageId: "i1", style: { photoTreatment: "wide" } }),
      block("story", 2, 1, 1, 24, 12, { articleId: "a2", style: { bg: "paper" } }),
      block("footer", 2, 1, 13, 24, 4, { articleId: "a3", style: { bg: "navy", invertText: true } }),
    ]), gridSpec);

    assert.ok(score.affinity < 0.6, `expected low affinity, got ${score.affinity}`);
    assert.equal(score.diagnostics.imageBlockCount, 1);
    assert.equal(score.diagnostics.narrowRailCount, 0);
  });

  it("fails a strong inner spread when static wrapper pages are visibly sparse", () => {
    const strongInnerMeasurement = {
      usefulOccupancy: 0.58,
      geometricCoverage: 0.96,
      underfilledBlocks: 16,
      pageMetrics: [
        { page: 1, renderFit: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, usefulOccupancy: 0.25 },
        { page: 2, renderFit: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, usefulOccupancy: 0.86 },
        { page: 3, renderFit: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, usefulOccupancy: 0.98 },
        { page: 4, renderFit: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, usefulOccupancy: 0.22 },
      ],
    };

    const score = scoreFullNewsletterOutput(layout([
      block("cover-title", 1, 1, 1, 8, 4, { inlineText: "June Newsletter" }),
      block("cover-inside", 1, 1, 5, 8, 12, { inlineText: "Inside this issue" }),
      block("inner-photo-1", 2, 1, 1, 8, 16, { imageId: "i1" }),
      block("inner-story-1", 2, 9, 1, 16, 16, { articleId: "a1" }),
      block("inner-photo-2", 3, 1, 1, 16, 16, { imageId: "i2" }),
      block("inner-story-2", 3, 17, 1, 8, 16, { articleId: "a2" }),
      block("back-a", 4, 1, 1, 8, 8, { inlineText: "Looking ahead" }),
      block("back-b", 4, 9, 1, 8, 8, { inlineText: "Save the date" }),
      block("back-c", 4, 17, 1, 8, 8, { inlineText: "Thank you" }),
    ]), 0.48, strongInnerMeasurement);

    assert.ok(score.fullOutputScore < 0.6, `expected sparse wrappers to miss ship floor, got ${score.fullOutputScore}`);
    assert.equal(score.coverRenderFit, 1);
  });

  it("does not count client-fill birthday placeholders as duplicate birthday content", () => {
    const score = scoreFullNewsletterOutput(layout([
      block("cover-birthday-placeholder", 1, 1, 1, 8, 5, {
        kind: "filler",
        heading: "Birthday List Placeholder",
        inlineText: "Client-fill area: Porter One adds birthdays separately.",
        style: { panelRole: "birthday", bg: "sun" },
      }),
      block("cover-title", 1, 9, 1, 8, 5, { inlineText: "June Newsletter" }),
      block("inner-story", 2, 1, 1, 24, 16, { articleId: "a1" }),
      block("inner-photo", 3, 1, 1, 24, 16, { imageId: "i1" }),
      block("back-a", 4, 1, 1, 8, 8, { inlineText: "Looking ahead" }),
    ]), 0.75);

    assert.equal(score.coverDuplicateBirthdayBlocks, 0);
  });
});
