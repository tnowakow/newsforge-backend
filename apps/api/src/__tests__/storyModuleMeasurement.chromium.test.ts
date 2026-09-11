import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, GridSpec, NewsImage } from "@newsforge/shared/schemas";
import { LETTER_RENDER_CONTRACT } from "@newsforge/shared";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/newsforge";
process.env.AI_UNLOCK_PASSWORD ??= "test-password";
process.env.INTERNAL_RENDER_SECRET ??= "test-secret";

const {
  clearStoryModuleMeasurementCache,
  measureStoryModule,
  storyModuleFontVersion,
  storyModuleStyleVersion,
} = await import("../services/storyModuleMeasurement.js");
const { composeInnerSpread } = await import("../services/innerSpreadComposer.js");
const { designLayout } = await import("../services/aiLayoutDesigner.js");
const { shutdownBrowser } = await import("../browser.js");

const TINY_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function article(): Article {
  return {
    id: "m1",
    title: "Measured Outing",
    body: "Residents visited the farmer market on Tuesday morning.\n\nThey returned with fresh berries and stories for the dining room.",
    byline: "Activities Team",
    wordCount: 24,
    source: "UPLOAD",
    imageRefs: ["photo.jpg"],
    isFiller: false,
  };
}

function image(): NewsImage {
  return {
    id: "img-1",
    originalName: "photo.jpg",
    url: TINY_GIF,
    aspect: "landscape",
    source: "UPLOAD",
    isPlaceholder: false,
    caption: "Market morning",
    focalX: 40,
    focalY: 55,
    fitMode: "cover",
  };
}

describe("story module measurement (chromium)", () => {
  it("measures production-aligned modules and caches until width/text/crop/font change", async () => {
    clearStoryModuleMeasurementCache();
    const base = {
      kind: "story-image" as const,
      article: article(),
      images: [image()],
      widthPx: 320,
      styleVersion: storyModuleStyleVersion(LETTER_RENDER_CONTRACT),
      fontVersion: storyModuleFontVersion(LETTER_RENDER_CONTRACT),
      headingFont: LETTER_RENDER_CONTRACT.fonts.heading,
      bodyFont: LETTER_RENDER_CONTRACT.fonts.body,
    };
    const first = await measureStoryModule(base);
    assert.equal(first.measured, true);
    assert.ok(first.intrinsicHeightPx > 40);
    assert.ok(first.contentHeightPx > 0);
    assert.deepEqual(first.sourceImageIds, ["img-1"]);

    const cached = await measureStoryModule(base);
    assert.equal(cached.cacheKey, first.cacheKey);
    assert.equal(cached.intrinsicHeightPx, first.intrinsicHeightPx);

    const wider = await measureStoryModule({ ...base, widthPx: 480 });
    assert.notEqual(wider.cacheKey, first.cacheKey);

    const editedText = await measureStoryModule({
      ...base,
      article: { ...article(), body: article().body + " An extra closing sentence stays visible." },
    });
    assert.notEqual(editedText.cacheKey, first.cacheKey);

    const cropChange = await measureStoryModule({
      ...base,
      images: [{ ...image(), focalX: 80, focalY: 20 }],
    });
    assert.notEqual(cropChange.cacheKey, first.cacheKey);

    const captionChange = await measureStoryModule({
      ...base,
      images: [{ ...image(), caption: "Different caption text" }],
    });
    assert.notEqual(captionChange.cacheKey, first.cacheKey);

    const fontChange = await measureStoryModule({
      ...base,
      fontVersion: "alt-font-version",
    });
    assert.notEqual(fontChange.cacheKey, first.cacheKey);
  });

  it("production designLayout campus-inner-spread path calls measurements", async () => {
    clearStoryModuleMeasurementCache();
    const gridSpec: GridSpec = { label: "inner", columns: 24, rowsPerPage: 16, slots: [] };
    const result = await designLayout({
      templateId: "v3-inner",
      pageCount: 2,
      gridSpec,
      articles: [
        article(),
        {
          id: "m2",
          title: "Second Story",
          body: "A shorter note for page balance.",
          wordCount: 7,
          source: "UPLOAD",
          isFiller: false,
        },
      ],
      images: [image()],
      recurringSections: [],
      brandVoice: "warm",
      brandKit: {
        primaryColor: "#1a2744",
        secondaryColor: "#4a6fa5",
        accentColor: "#c45c26",
        headingFont: LETTER_RENDER_CONTRACT.fonts.heading,
        bodyFont: LETTER_RENDER_CONTRACT.fonts.body,
        logoUrl: null,
      },
      clientName: "Trilogy",
      monthLabel: "July 2026",
      layoutMode: "campus-inner-spread",
    });

    assert.equal(result.mode, "deterministic");
    assert.equal(result.promptAudit.model, "measured-inner-spread");
    assert.match(result.promptAudit.userPrompt, /measure:storyModule/);
    assert.match(result.promptAudit.userPrompt, /measurements:calls=/);
    assert.ok(result.layout.pageCount === 2);
    assert.ok(result.layout.blocks.some((b) => b.articleId === "m1"));
    assert.ok(result.layout.blocks.some((b) => b.imageId === "img-1"));
  });

  it("composeInnerSpread default path uses real measureStoryModule", async () => {
    clearStoryModuleMeasurementCache();
    const gridSpec: GridSpec = { label: "inner", columns: 24, rowsPerPage: 16, slots: [] };
    const result = await composeInnerSpread({
      source: [article()],
      images: [image()],
      contract: {
        gridSpec,
        maxCandidates: 2,
        minBodyFontSizePt: LETTER_RENDER_CONTRACT.type.bodyPt,
        bodyFontSizePt: LETTER_RENDER_CONTRACT.type.bodyPt,
      },
    });
    assert.equal(result.usedMeasurements, true);
    assert.ok(result.measurementCallCount >= 1);
    assert.ok(result.decisionTrace.some((t) => t.startsWith("measurements:calls=")));
  });

  it("shuts down the shared browser so the test process can exit", async () => {
    await shutdownBrowser();
  });
});
