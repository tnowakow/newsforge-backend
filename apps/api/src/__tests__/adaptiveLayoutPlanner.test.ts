import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Article,
  AssembledLayout,
  GridSpec,
  NewsImage,
  TemplateSlot,
} from "@newsforge/shared/schemas";
import {
  applyCandidateMeasurements,
  applyPorterFamilyGeometryGuard,
  buildAdaptiveLayout,
  chooseAdaptiveCandidate,
  createEditorialPlan,
} from "../services/adaptiveLayoutPlanner.js";
import { evaluatePorterLayoutPlaybook } from "../services/porterLayoutPlaybook.js";

function simpleLayout(templateId: string, blocks: AssembledLayout["blocks"]): AssembledLayout {
  return {
    templateId,
    pageCount: 2,
    version: 1,
    blocks,
    unfilledSlotIds: [],
    stats: { placedArticles: 0, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
  };
}
import type {
  AdaptiveLayoutCandidate,
  CandidateMeasurement,
} from "../services/adaptiveLayoutPlanner.js";

function geometrySignature(candidate: ReturnType<typeof buildAdaptiveLayout>["candidates"][number]): string {
  return candidate.layout.blocks
    .filter((block) => block.articleId || block.imageId)
    .map((block) =>
      [
        block.articleId ? `a:${block.articleId}` : `i:${block.imageId}`,
        block.page,
        block.position.col,
        block.position.row,
        block.position.colSpan,
        block.position.rowSpan,
      ].join(":"),
    )
    .sort()
    .join("|");
}

function slot(
  id: string,
  type: TemplateSlot["type"],
  page: number,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  maxWords?: number,
  styleTag?: string,
): TemplateSlot {
  return {
    id,
    type,
    page,
    col,
    row,
    colSpan,
    rowSpan,
    capacity: maxWords ? { maxWords } : {},
    styleTag,
  };
}

function article(
  id: string,
  title: string,
  wordCount: number,
  articleType: Article["articleType"] = "other",
  source: Article["source"] = "MOCK",
): Article {
  return {
    id,
    title,
    body: Array.from({ length: wordCount }, (_, i) => `word${i}`).join(" "),
    wordCount,
    articleType,
    source,
    isFiller: false,
  };
}

function image(
  id: string,
  aspect: NewsImage["aspect"] = "landscape",
  source: NewsImage["source"] = "STOCK",
): NewsImage {
  return {
    id,
    url: `https://example.com/${id}.jpg`,
    caption: id,
    aspect,
    source,
    isPlaceholder: false,
  };
}

const gridSpec: GridSpec = {
  label: "adaptive-test",
  columns: 12,
  rowsPerPage: 10,
  slots: [
    slot("hero", "spotlight", 1, 1, 1, 7, 4, 220, "hero"),
    slot("hero-photo", "image", 1, 8, 1, 5, 4, undefined, "hero"),
    slot("event", "body", 1, 1, 5, 6, 3, 130),
    slot("note", "sidebar", 1, 7, 5, 6, 3, 130),
    slot("photo-strip-1", "image", 2, 1, 1, 4, 4),
    slot("photo-strip-2", "image", 2, 5, 1, 4, 4),
    slot("photo-strip-3", "image", 2, 9, 1, 4, 4),
    slot("briefs", "list", 2, 1, 5, 12, 3, 80, "birthday"),
  ],
};

describe("adaptiveLayoutPlanner.createEditorialPlan", () => {
  it("anchors Panel Garden family rails and photo pairs to seeded geometry", () => {
    const skeleton = simpleLayout("v3-panel-garden", [
      {
        blockId: "bday", slotId: "pg-p1-bday", page: 1, position: { col: 1, row: 1, colSpan: 6, rowSpan: 9 },
        kind: "list", needsFiller: false, zIndex: 0,
      },
      {
        blockId: "img", slotId: "pg-p1-img1", page: 1, position: { col: 16, row: 5, colSpan: 9, rowSpan: 5 },
        kind: "image", imageId: "image-1", needsFiller: false, zIndex: 0,
      },
    ]);
    const moved = simpleLayout("v3-panel-garden", [
      { ...skeleton.blocks[0], position: { col: 7, row: 1, colSpan: 18, rowSpan: 4 } },
      { ...skeleton.blocks[1], position: { col: 1, row: 1, colSpan: 24, rowSpan: 16 } },
    ]);
    const guarded = applyPorterFamilyGeometryGuard(moved, "v3-panel-garden", skeleton);
    assert.deepEqual(guarded.blocks.map((block) => block.position), skeleton.blocks.map((block) => block.position));
    assert.equal(guarded.blocks[0].style?.panelRole, "featureBand");
    assert.equal(guarded.blocks[1].style?.photoTreatment, "collage");
  });

  it("promotes resident stories and uploaded content into required editorial items", () => {
    const articles = [
      article("birthday", "July Birthdays", 60, "birthday"),
      article("lead", "Meet Dorothy", 220, "resident-story"),
      article("upload", "Garden Club Notes", 120, "announcement", "UPLOAD"),
    ];
    const plan = createEditorialPlan(articles, [image("i1"), image("i2")]);
    assert.equal(plan.leadArticleId, "lead");
    assert.ok(plan.requiredArticleIds.includes("lead"));
    assert.ok(plan.requiredArticleIds.includes("upload"));
    assert.equal(plan.photoGoal, "balanced");
    assert.equal(plan.compositionGrammar, "lead-story-collage");
    assert.equal(plan.visualPersonality, "resident-spotlight");
  });

  it("marks a photo-led issue when images outweigh stories", () => {
    const plan = createEditorialPlan(
      [article("a1", "Short Recap", 80)],
      Array.from({ length: 6 }, (_, i) => image(`i${i}`)),
    );
    assert.equal(plan.photoGoal, "photo-led");
    assert.equal(plan.compositionGrammar, "photo-recap-spread");
    assert.equal(plan.visualPersonality, "photo-journal");
  });

  it("recognizes event and milestone issues as their own composition grammar", () => {
    const plan = createEditorialPlan(
      [
        article("birthday", "July Birthdays", 60, "birthday"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      [image("i1"), image("i2")],
    );
    assert.equal(plan.compositionGrammar, "events-and-milestones");
  });

  it("uses brand voice to choose a celebration personality", () => {
    const plan = createEditorialPlan(
      [
        article("lead", "Meet Dorothy", 160, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      [image("i1"), image("i2")],
      { brandVoice: "Warm, colorful, community-focused, energetic" },
    );

    assert.equal(plan.visualPersonality, "celebration-pop");
  });
});

describe("adaptiveLayoutPlanner.buildAdaptiveLayout", () => {
  it("generates multiple scored candidates and chooses a valid winner", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("birthday", "July Birthdays", 60, "birthday"),
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("director", "From the Executive Director", 100, "executive-note"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [
        image("upload-photo", "portrait", "UPLOAD"),
        image("wide-photo", "landscape", "STOCK"),
        image("group-photo", "landscape", "STOCK"),
      ],
    });

    assert.equal(result.candidates.length, 8);
    assert.ok(result.candidates.some((candidate) => candidate.geometryVariant !== "fixed"));
    assert.ok(result.candidates.some((candidate) => candidate.geometryVariant === "grammar-feature-stack"));
    assert.ok(result.chosen.score >= 0);
    assert.ok(result.chosen.subscores.geometryValidity > 0.99);
    assert.ok(result.chosen.subscores.grammarAffinity >= 0.48);
    assert.ok(result.chosen.subscores.porterReferenceAffinity !== undefined);
    assert.ok(result.chosen.subscores.requiredCoverage > 0.99);
    assert.ok(result.chosen.layout.blocks.some((block) => block.articleId === "lead"));
  });

  it("creates materially different geometry candidates, not only content-order variants", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("birthday", "July Birthdays", 60, "birthday"),
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [
        image("wide-photo", "landscape", "UPLOAD"),
        image("group-photo", "landscape", "STOCK"),
      ],
    });
    const signatures = new Set(result.candidates.map(geometrySignature));
    assert.ok(signatures.size >= 2);
    assert.ok(result.candidates.every((candidate) => candidate.subscores.geometryValidity > 0.99));
  });

  it("reranks candidates when browser measurement finds render failures", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const [first, second] = result.candidates;
    const reranked = applyCandidateMeasurements(result.candidates, [
      {
        candidateId: first.id,
        clippedBlocks: first.layout.blocks.length,
        overflowBlocks: 0,
        missingImages: 1,
        renderedImages: 0,
        totalImages: 1,
        usefulOccupancy: 0.9,
        lowUtilityBlocks: 0,
      },
      {
        candidateId: second.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.9,
        lowUtilityBlocks: 0,
      },
    ]);

    assert.equal(reranked[0].id, second.id);
    assert.equal(reranked[0].subscores.renderFit, 1);
    assert.ok(reranked.at(-1)?.warnings.some((warning) => warning.startsWith("render-clipped-blocks")));
  });

  it("prefers a clean measured candidate over a higher static score with clipping", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const [first, second] = result.candidates;
    const reranked = applyCandidateMeasurements([
      { ...first, score: 0.96 },
      { ...second, score: 0.9 },
    ], [
      {
        candidateId: first.id,
        clippedBlocks: 1,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.9,
        lowUtilityBlocks: 0,
      },
      {
        candidateId: second.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.84,
        lowUtilityBlocks: 0,
      },
    ]);

    assert.equal(reranked[0].id, second.id);
    assert.equal(reranked[0].subscores.renderFit, 1);
  });


  it("reranks visually useful candidates above clean but underfilled candidates", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const [first, second] = result.candidates;
    const reranked = applyCandidateMeasurements([
      { ...first, score: 0.9 },
      { ...second, score: 0.88 },
    ], [
      {
        candidateId: first.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.2,
        lowUtilityBlocks: 2,
      },
      {
        candidateId: second.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.9,
        lowUtilityBlocks: 0,
      },
    ]);

    assert.equal(reranked[0].id, second.id);
    assert.equal(reranked[0].subscores.usefulOccupancy, 0.9);
    assert.ok(reranked[1].warnings.includes("low-utility-blocks:2"));
  });

  it("treats measured page density as a first-class ranking signal", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const [underfilled, dense] = result.candidates;
    const reranked = applyCandidateMeasurements([
      { ...underfilled, score: 0.99 },
      { ...dense, score: 0.91 },
    ], [
      {
        candidateId: underfilled.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.54,
        lowUtilityBlocks: 3,
      },
      {
        candidateId: dense.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.9,
        lowUtilityBlocks: 0,
      },
    ]);

    assert.equal(reranked[0].id, dense.id);
    assert.ok(reranked[1].warnings.includes("low-utility-blocks:3"));
  });

  it("uses variation seeds only among near-best candidates", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const closeCandidates = result.candidates.map((candidate, index) => ({
      ...candidate,
      score: 1 - index * 0.01,
    }));
    const chosenIds = new Set(
      Array.from({ length: 20 }, (_, index) =>
        chooseAdaptiveCandidate(closeCandidates, `seed-${index}`).id,
      ),
    );
    assert.ok(chosenIds.size > 1);

    const farCandidates = closeCandidates.map((candidate, index) => ({
      ...candidate,
      score: index === 0 ? 1 : 0.7,
    }));
    assert.equal(chooseAdaptiveCandidate(farCandidates, "seed-any").id, farCandidates[0].id);
  });

  it("does not let variation pick lower-utility candidates over clean winners", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const candidates = result.candidates.slice(0, 3).map((candidate, index) => ({
      ...candidate,
      score: 1 - index * 0.01,
      subscores: {
        ...candidate.subscores,
        usefulOccupancy: index === 0 ? 0.9 : 0.72,
      },
      warnings: index === 0 ? [] : ["low-utility-blocks:1"],
    }));

    const chosenIds = new Set(
      Array.from({ length: 20 }, (_, index) =>
        chooseAdaptiveCandidate(candidates, `seed-${index}`).id,
      ),
    );

    assert.deepEqual(chosenIds, new Set([candidates[0].id]));
  });

  it("gates out candidates that fail critical Porter designer rules", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] },
      ],
      images: [{ ...image("legacy-photo", "landscape", "UPLOAD"), caption: "Legacy.jpg" }],
    });
    const [first, second] = result.candidates;
    assert.ok(first);
    assert.ok(second);

    const chosen = chooseAdaptiveCandidate([
      {
        ...first,
        id: "photo-band-expand",
        score: 0.9,
        warnings: ["porter-critical:photo-story-pairing"],
      },
      {
        ...second,
        id: "compound-tile-packer",
        score: 0.62,
        warnings: [],
      },
    ], "porter-hard-gate");

    assert.equal(chosen.id, "compound-tile-packer");
  });

  it("gates out measured candidates with severe white-space repair failures", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] },
      ],
      images: [{ ...image("legacy-photo", "landscape", "UPLOAD"), caption: "Legacy.jpg" }],
    });
    const [first, second] = result.candidates;
    assert.ok(first);
    assert.ok(second);

    const measured = applyCandidateMeasurements([
      { ...first, id: "technically-clean-but-empty", score: 0.95, warnings: [] },
      { ...second, id: "lower-score-designer-layout", score: 0.6, warnings: [] },
    ], [
      {
        candidateId: "technically-clean-but-empty",
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.43,
        minPageUtility: 0.22,
        largestEmptyBandRatio: 0,
        lowUtilityBlocks: 12,
        underfilledBlocks: 21,
      },
      {
        candidateId: "lower-score-designer-layout",
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.64,
        minPageUtility: 0.5,
        largestEmptyBandRatio: 0,
        lowUtilityBlocks: 3,
        underfilledBlocks: 6,
      },
    ]);
    const badWhitespace = measured.find((candidate) => candidate.id === "technically-clean-but-empty");
    const cleanEnough = measured.find((candidate) => candidate.id === "lower-score-designer-layout");
    assert.ok(badWhitespace);
    assert.ok(cleanEnough);

    assert.equal(badWhitespace?.warnings.includes("porter-critical:white-space-repair"), true);
    assert.equal(cleanEnough?.warnings.includes("porter-critical:white-space-repair"), false);
    assert.equal(chooseAdaptiveCandidate([badWhitespace, cleanEnough], "porter-hard-gate").id, "lower-score-designer-layout");
  });

  it("gates out loaded images that are rendered placeholders instead of real photos", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] },
      ],
      images: [{ ...image("legacy-photo", "landscape", "UPLOAD"), caption: "Legacy.jpg" }],
    });
    const [first, second] = result.candidates;
    assert.ok(first);
    assert.ok(second);

    const measured = applyCandidateMeasurements([
      { ...first, id: "loaded-placeholder-photo", score: 0.9, warnings: [] },
      { ...second, id: "real-photo-layout", score: 0.58, warnings: [] },
    ], [
      {
        candidateId: "loaded-placeholder-photo",
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        placeholderImages: 1,
        realRenderedImages: 0,
        totalImages: 1,
        usefulOccupancy: 0.82,
        minPageUtility: 0.76,
        largestEmptyBandRatio: 0,
        lowUtilityBlocks: 0,
        underfilledBlocks: 2,
      },
      {
        candidateId: "real-photo-layout",
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        placeholderImages: 0,
        realRenderedImages: 1,
        totalImages: 1,
        usefulOccupancy: 0.68,
        minPageUtility: 0.58,
        largestEmptyBandRatio: 0,
        lowUtilityBlocks: 2,
        underfilledBlocks: 6,
      },
    ]);
    const placeholder = measured.find((candidate) => candidate.id === "loaded-placeholder-photo");
    const real = measured.find((candidate) => candidate.id === "real-photo-layout");
    assert.ok(placeholder);
    assert.ok(real);

    assert.equal(placeholder.warnings.includes("render-placeholder-images:1"), true);
    assert.equal(placeholder.warnings.includes("porter-critical:photo-realism"), true);
    assert.equal(real.warnings.includes("porter-critical:photo-realism"), false);
    assert.equal(chooseAdaptiveCandidate([placeholder, real], "porter-photo-gate").id, "real-photo-layout");
  });

  it("prefers a clean uploaded source topology when it is close to the measured winner", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] },
        { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chef.jpg"] },
      ],
      images: [
        { ...image("legacy-photo", "landscape", "UPLOAD"), caption: "Legacy.jpg" },
        { ...image("chef-photo", "landscape", "UPLOAD"), caption: "Chef.jpg" },
      ],
    });
    const source = result.candidates.find((candidate) => candidate.id === "source-topology");
    const other = result.candidates.find((candidate) => candidate.id !== "source-topology");
    assert.ok(source);
    assert.ok(other);

    const chosen = chooseAdaptiveCandidate([
      {
        ...other,
        score: 0.64,
        subscores: { ...other.subscores, renderFit: 1, usefulOccupancy: 0.7, porterReferenceAffinity: 0.72 },
        warnings: [],
      },
      {
        ...source,
        score: 0.58,
        subscores: { ...source.subscores, renderFit: 1, usefulOccupancy: 0.6, porterReferenceAffinity: 0.7 },
        warnings: ["underfilled-blocks:4"],
      },
    ], "source-upload-smoke");

    assert.equal(chosen.id, "source-topology");
  });

  it("does not let source topology override a clearly better Porter composition", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] },
        { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chef.jpg"] },
      ],
      images: [
        { ...image("legacy-photo", "landscape", "UPLOAD"), caption: "Legacy.jpg" },
        { ...image("chef-photo", "landscape", "UPLOAD"), caption: "Chef.jpg" },
      ],
    });
    const source = result.candidates.find((candidate) => candidate.id === "source-topology");
    const other = result.candidates.find((candidate) => candidate.id !== "source-topology");
    assert.ok(source);
    assert.ok(other);

    const chosen = chooseAdaptiveCandidate([
      {
        ...other,
        id: "measured-porter-composition",
        score: 0.72,
        subscores: {
          ...other.subscores,
          renderFit: 1,
          usefulOccupancy: 0.82,
          porterReferenceAffinity: 0.78,
        },
        warnings: [],
      },
      {
        ...source,
        score: 0.64,
        subscores: {
          ...source.subscores,
          renderFit: 1,
          usefulOccupancy: 0.7,
          porterReferenceAffinity: 0.64,
        },
        warnings: ["underfilled-blocks:6"],
      },
    ], "source-upload-smoke");

    assert.equal(chosen.id, "measured-porter-composition");
  });

  it("does not vary into candidates with meaningfully worse PorterOne reference affinity", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const candidates = result.candidates.slice(0, 2).map((candidate, index) => ({
      ...candidate,
      score: index === 0 ? 1 : 0.99,
      subscores: {
        ...candidate.subscores,
        renderFit: 1,
        usefulOccupancy: 0.9,
        porterReferenceAffinity: index === 0 ? 0.86 : 0.72,
      },
      warnings: [],
    }));

    const chosenIds = new Set(
      Array.from({ length: 20 }, (_, index) =>
        chooseAdaptiveCandidate(candidates, `seed-${index}`).id,
      ),
    );

    assert.deepEqual(chosenIds, new Set([candidates[0].id]));
  });

  it("keeps variation inside a tight useful-occupancy band", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const candidates = result.candidates.slice(0, 2).map((candidate, index) => ({
      ...candidate,
      score: index === 0 ? 1 : 0.99,
      subscores: {
        ...candidate.subscores,
        usefulOccupancy: index === 0 ? 0.9 : 0.84,
      },
      warnings: [],
    }));

    const chosenIds = new Set(
      Array.from({ length: 20 }, (_, index) =>
        chooseAdaptiveCandidate(candidates, `seed-${index}`).id,
      ),
    );

    assert.deepEqual(chosenIds, new Set([candidates[0].id]));
  });

  it("does not vary into candidates with more low-utility blocks than the best option", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const candidates = result.candidates.slice(0, 2).map((candidate, index) => ({
      ...candidate,
      score: index === 0 ? 1 : 0.99,
      subscores: {
        ...candidate.subscores,
        usefulOccupancy: index === 0 ? 0.82 : 0.8,
      },
      warnings: index === 0 ? ["low-utility-blocks:1"] : ["low-utility-blocks:2"],
    }));

    const chosenIds = new Set(
      Array.from({ length: 20 }, (_, index) =>
        chooseAdaptiveCandidate(candidates, `seed-${index}`).id,
      ),
    );

    assert.deepEqual(chosenIds, new Set([candidates[0].id]));
  });

  it("does not vary into candidates with worse render fit than the best option", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const candidates = result.candidates.slice(0, 2).map((candidate, index) => ({
      ...candidate,
      score: index === 0 ? 1 : 0.99,
      subscores: {
        ...candidate.subscores,
        renderFit: index === 0 ? 1 : 0.94,
        usefulOccupancy: 0.9,
      },
      warnings: index === 0 ? [] : ["render-clipped-blocks:1"],
    }));

    const chosenIds = new Set(
      Array.from({ length: 20 }, (_, index) =>
        chooseAdaptiveCandidate(candidates, `seed-${index}`).id,
      ),
    );

    assert.deepEqual(chosenIds, new Set([candidates[0].id]));
  });

  it("creates a grammar feature stack candidate for story-led issues", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("director", "From the Executive Director", 100, "executive-note"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD"), image("wide-photo")],
    });
    const grammar = result.candidates.find(
      (candidate) => candidate.geometryVariant === "grammar-feature-stack",
    );

    assert.equal(result.plan.compositionGrammar, "director-note-feature");
    assert.ok(grammar, "expected a grammar feature stack candidate");
    assert.equal(grammar.subscores.grammarAffinity, 1);
    const lead = grammar.layout.blocks.find((block) => block.articleId === "lead");
    assert.ok(lead);
    assert.equal(lead.position.col, 1);
    assert.equal(lead.position.row, 1);
    assert.equal(lead.position.colSpan, 7);
    assert.ok(grammar.subscores.geometryValidity > 0.99);
  });

  it("creates a photo mosaic candidate for photo-led issues", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [article("lead", "Meet Dorothy", 160, "resident-story")],
      images: Array.from({ length: 6 }, (_, i) => image(`photo-${i}`, "landscape")),
    });
    const mosaic = result.candidates.find(
      (candidate) => candidate.geometryVariant === "grammar-photo-mosaic",
    );

    assert.equal(result.plan.compositionGrammar, "photo-recap-spread");
    assert.ok(mosaic, "expected a grammar photo mosaic candidate");
    assert.equal(mosaic.subscores.grammarAffinity, 1);
    const imageBlocks = mosaic.layout.blocks.filter((block) => block.imageId);
    assert.ok(imageBlocks.length >= 3);
    assert.ok(imageBlocks.some((block) => block.position.row === 1 && block.position.rowSpan === 4));
    assert.ok(mosaic.subscores.geometryValidity > 0.99);
  });

  it("creates a text/photo rebalance candidate by shifting adjacent region boundaries", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 220, "resident-story"),
        article("event", "Summer Concert Recap", 125, "event-recap"),
      ],
      images: [image("upload-photo", "portrait", "UPLOAD")],
    });
    const rebalanced = result.candidates.find(
      (candidate) => candidate.geometryVariant === "text-photo-rebalance",
    );

    assert.ok(rebalanced, "expected a text/photo rebalance candidate");
    const lead = rebalanced.layout.blocks.find((block) => block.articleId === "lead");
    const photo = rebalanced.layout.blocks.find((block) => block.imageId === "upload-photo");
    assert.ok(lead);
    assert.ok(photo);
    assert.equal(lead.position.colSpan, 9);
    assert.equal(photo.position.col, 10);
    assert.equal(photo.position.colSpan, 3);
    assert.ok(rebalanced.subscores.geometryValidity > 0.99);
  });

  it("keeps uploaded photos next to the articles that reference their filenames", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 29, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] },
        article("happy", "Happy Hours", 20, "event-recap", "UPLOAD"),
        article("socials", "Socials", 16, "event-recap", "UPLOAD"),
        article("brunch", "Brunch", 3, "announcement", "UPLOAD"),
        { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chefs Circle.heic"] },
        { ...article("music", "Music to My Ears", 17, "other", "UPLOAD"), imageRefs: ["Music to My Ears 2.heic"] },
      ],
      images: [
        { ...image("chef-img", "landscape", "UPLOAD"), caption: "Chefs Circle.heic" },
        { ...image("legacy-img", "landscape", "UPLOAD"), caption: "Legacy.jpg" },
        { ...image("music-img", "landscape", "UPLOAD"), caption: "Music to My Ears 2.heic" },
      ],
    });
    const source = result.candidates.find((candidate) => candidate.id === "source-topology");
    assert.ok(source, "expected uploaded source topology candidate");

    const happy = source.layout.blocks.find((block) => block.slotId === "source-happy");
    const socials = source.layout.blocks.find((block) => block.slotId === "source-socials");
    const chef = source.layout.blocks.find((block) => block.articleId === "chef");
    const chefImage = source.layout.blocks.find((block) => block.imageId === "chef-img");
    const music = source.layout.blocks.find((block) => block.articleId === "music");
    const musicImage = source.layout.blocks.find((block) => block.imageId === "music-img");
    const directorImage = source.layout.blocks.find(
      (block) => block.page === 1 && block.position.row === 1 && block.imageId,
    );

    assert.equal(happy?.style?.panelRole, "happyHour");
    assert.equal(happy?.style?.bg, "sky");
    assert.equal(happy?.style?.headerColor, "navy");
    assert.equal(happy?.style?.invertText, false);
    assert.equal(socials?.style?.panelRole, "upcomingEvents");
    assert.equal(socials?.style?.bg, "cream");
    assert.equal(socials?.style?.headerColor, "coral");
    assert.ok(chef);
    assert.ok(chefImage);
    assert.equal(chefImage.page, chef.page);
    assert.equal(chefImage.position.row, chef.position.row);
    assert.ok(music);
    assert.ok(musicImage);
    assert.equal(musicImage.page, music.page);
    assert.equal(musicImage.position.row, music.position.row);
    assert.equal(directorImage, undefined);
  });

  it("reports DOCX photo refs that do not match uploaded image names", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [
        { ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["photo1.jpg"] },
      ],
      images: [
        { ...image("legacy-real", "landscape", "UPLOAD"), caption: "Legacy Celebration.jpg" },
      ],
    });

    assert.ok(
      result.chosen.warnings.some((warning) => warning.startsWith("porter-unmatched-photo-refs:1:photo1.jpg")),
      "expected unmatched generic photo ref to be visible in candidate warnings",
    );
  });

  it("locks the Trilogy phase 0 source-upload baseline against empty inner pages and schedule color regressions", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 29, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg", "Legacy 2.jpg"] },
        { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chefs Circle.heic"] },
        { ...article("music", "Music to My Ears", 17, "other", "UPLOAD"), imageRefs: ["Music to My Ears.jpg", "Music to My Ears 2.heic"] },
        article("resident", "Resident Council", 21, "other", "UPLOAD"),
        { ...article("outing", "Out & About", 21, "other", "UPLOAD"), imageRefs: ["Out and About.jpg"] },
        { ...article("intergen", "Intergenerational Fun", 22, "other", "UPLOAD"), imageRefs: ["Intergenerational Fun.jpg"] },
        article("happy", "Happy Hours", 21, "event-recap", "UPLOAD"),
        article("socials", "Socials", 16, "event-recap", "UPLOAD"),
        article("brunch", "Brunch", 3, "announcement", "UPLOAD"),
      ],
      images: [
        { ...image("legacy-1", "landscape", "UPLOAD"), caption: "Legacy.jpg" },
        { ...image("legacy-2", "landscape", "UPLOAD"), caption: "Legacy 2.jpg" },
        { ...image("chef-img", "landscape", "UPLOAD"), caption: "Chefs Circle.heic" },
        { ...image("music-1", "landscape", "UPLOAD"), caption: "Music to My Ears.jpg" },
        { ...image("music-2", "landscape", "UPLOAD"), caption: "Music to My Ears 2.heic" },
        { ...image("outing-img", "landscape", "UPLOAD"), caption: "Out and About.jpg" },
        { ...image("intergen-img", "landscape", "UPLOAD"), caption: "Intergenerational Fun.jpg" },
      ],
    });
    const source = result.candidates.find((candidate) => candidate.id === "source-topology");
    assert.ok(source, "expected uploaded source topology candidate");
    assert.equal(source.label, "Uploaded source Porter composition: rail mosaic");
    assert.ok(result.candidates.some((candidate) => candidate.id === "source-porter-guided-sparse"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "source-story-river"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "source-photo-stair"));

    const contentBlocks = source.layout.blocks.filter((block) => block.articleId || block.imageId || block.kind === "list");
    const page1Blocks = contentBlocks.filter((block) => block.page === 1);
    const page2Blocks = contentBlocks.filter((block) => block.page === 2);
    assert.ok(page1Blocks.length >= 4, "page 1 should retain meaningful content");
    assert.ok(page2Blocks.length >= 4, "page 2 should retain meaningful content");
    assert.ok(page2Blocks.some((block) => block.articleId), "page 2 must not collapse to photos only");

    const happy = source.layout.blocks.find((block) => block.slotId === "source-happy");
    const socials = source.layout.blocks.find((block) => block.slotId === "source-socials");
    assert.equal(happy?.style?.panelRole, "happyHour");
    assert.equal(happy?.style?.bg, "sky");
    assert.equal(happy?.style?.headerColor, "navy");
    assert.equal(happy?.style?.invertText, false);
    assert.equal(socials?.style?.panelRole, "upcomingEvents");
    assert.equal(socials?.style?.bg, "cream");
    assert.equal(socials?.style?.headerColor, "coral");
    assert.equal(socials?.style?.invertText, false);
    const director = source.layout.blocks.find((block) => block.articleId === "director");
    const legacy = source.layout.blocks.find((block) => block.articleId === "legacy");
    const chef = source.layout.blocks.find((block) => block.articleId === "chef");
    assert.equal(director?.style?.bg, "cream");
    assert.equal(director?.style?.headerColor, "navy");
    assert.equal(director?.style?.invertText, false);
    assert.equal(legacy?.style?.bg, "berry");
    assert.equal(legacy?.style?.headerColor, "navy");
    assert.equal(legacy?.style?.invertText, false);
    assert.notEqual(chef?.style?.bg, undefined);
    assert.notEqual(chef?.style?.headerColor, "paper");
    assert.notEqual(chef?.style?.headerColor, "cream");

    const placedArticleIds = new Set(source.layout.blocks.map((block) => block.articleId).filter(Boolean));
    const placedListSlotIds = new Set(
      source.layout.blocks
        .filter((block) => block.kind === "list")
        .map((block) => block.slotId),
    );
    assert.equal(placedArticleIds.has("director"), true);
    assert.equal(placedArticleIds.has("legacy"), true);
    assert.equal(placedArticleIds.has("chef"), true);
    assert.equal(placedArticleIds.has("music"), true);
    assert.equal(placedArticleIds.has("outing"), true);
    assert.equal(placedArticleIds.has("intergen"), true);
    assert.equal(placedListSlotIds.has("source-happy"), true);
    assert.equal(placedListSlotIds.has("source-socials"), true);
    assert.equal(placedListSlotIds.has("source-brunch"), true);

    const chefImage = source.layout.blocks.find((block) => block.imageId === "chef-img");
    const musicImage = source.layout.blocks.find((block) => block.imageId === "music-1");
    const outingImage = source.layout.blocks.find((block) => block.imageId === "outing-img");
    const intergenImage = source.layout.blocks.find((block) => block.imageId === "intergen-img");
    const outing = source.layout.blocks.find((block) => block.articleId === "outing");
    const intergen = source.layout.blocks.find((block) => block.articleId === "intergen");
    assert.equal(chefImage?.caption, "Chef Circle");
    assert.equal(musicImage?.caption, "Music to My Ears");
    assert.equal(outingImage?.caption, "Out & About");
    assert.equal(intergenImage?.caption, "Intergenerational Fun");
    assert.equal(outingImage?.style?.panelRole, undefined);
    assert.equal(intergenImage?.style?.panelRole, undefined);
    assert.equal(outingImage?.style?.photoTreatment, "rounded");
    assert.equal(intergenImage?.style?.photoTreatment, "rounded");
    assert.equal(outingImage?.page, outing?.page);
    assert.equal(intergenImage?.page, intergen?.page);
    assert.ok(
      outingImage && outing &&
        Math.abs(outingImage.position.row - outing.position.row) <= outing.position.rowSpan,
      "Out & About image should stay near its story",
    );
    assert.ok(
      intergenImage && intergen &&
        Math.abs(intergenImage.position.row - intergen.position.row) <= intergen.position.rowSpan,
      "Intergenerational Fun image should stay near its story",
    );
    const articleAndListWidths = new Set(
      source.layout.blocks
        .filter((block) => block.articleId || block.kind === "list")
        .map((block) => block.position.colSpan),
    );
    assert.ok(articleAndListWidths.size >= 4, "dense Porter source packer should avoid uniform same-width boxes");
    assert.ok(
      source.layout.blocks.some((block) => block.imageId && block.position.rowSpan >= 6 && block.position.colSpan <= 6),
      "dense Porter source packer should create at least one vertical photo rail",
    );
    assert.ok(
      source.layout.blocks.some((block) => block.page === 1 && block.imageId && block.position.row >= 10),
      "dense Porter source packer should anchor the lower page with photo rhythm",
    );

    for (const block of source.layout.blocks) {
      assert.ok(block.position.col >= 1);
      assert.ok(block.position.row >= 1);
      assert.ok(block.position.col + block.position.colSpan - 1 <= 24);
      assert.ok(block.position.row + block.position.rowSpan - 1 <= 16);
    }
    const blocks = source.layout.blocks;
    for (const [index, block] of blocks.entries()) {
      for (const other of blocks.slice(index + 1)) {
        if (block.page !== other.page) continue;
        const overlap: boolean = !(
          block.position.col + block.position.colSpan - 1 < other.position.col ||
          other.position.col + other.position.colSpan - 1 < block.position.col ||
          block.position.row + block.position.rowSpan - 1 < other.position.row ||
          other.position.row + other.position.rowSpan - 1 < block.position.row
        );
        assert.equal(overlap, false, `blocks ${block.slotId} and ${other.slotId} should not overlap`);
      }
    }

    const playbook = evaluatePorterLayoutPlaybook({
      layout: source.layout,
      articles: result.plan.items.length
        ? [
            article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
            { ...article("legacy", "Legacy News", 29, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg", "Legacy 2.jpg"] },
            { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chefs Circle.heic"] },
            { ...article("music", "Music to My Ears", 17, "other", "UPLOAD"), imageRefs: ["Music to My Ears.jpg", "Music to My Ears 2.heic"] },
            article("resident", "Resident Council", 21, "other", "UPLOAD"),
            { ...article("outing", "Out & About", 21, "other", "UPLOAD"), imageRefs: ["Out and About.jpg"] },
            { ...article("intergen", "Intergenerational Fun", 22, "other", "UPLOAD"), imageRefs: ["Intergenerational Fun.jpg"] },
            article("happy", "Happy Hours", 21, "event-recap", "UPLOAD"),
            article("socials", "Socials", 16, "event-recap", "UPLOAD"),
            article("brunch", "Brunch", 3, "announcement", "UPLOAD"),
          ]
        : [],
      images: [
        { ...image("legacy-1", "landscape", "UPLOAD"), caption: "Legacy.jpg" },
        { ...image("legacy-2", "landscape", "UPLOAD"), caption: "Legacy 2.jpg" },
        { ...image("chef-img", "landscape", "UPLOAD"), caption: "Chefs Circle.heic" },
        { ...image("music-1", "landscape", "UPLOAD"), caption: "Music to My Ears.jpg" },
        { ...image("music-2", "landscape", "UPLOAD"), caption: "Music to My Ears 2.heic" },
        { ...image("outing-img", "landscape", "UPLOAD"), caption: "Out and About.jpg" },
        { ...image("intergen-img", "landscape", "UPLOAD"), caption: "Intergenerational Fun.jpg" },
      ],
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      referenceFamily: "dense-lavender-grid",
      measurement: {
        candidateId: source.id,
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 7,
        totalImages: 7,
        usefulOccupancy: 0.78,
        geometricCoverage: 0.92,
        minPageUtility: 0.72,
        largestEmptyBandRatio: 0.04,
        lowUtilityBlocks: 2,
        underfilledBlocks: 3,
      },
    });
    assert.equal(playbook.family, "dense-lavender-grid");
    assert.ok(playbook.rules.length >= 7);
    assert.equal(playbook.rules.find((rule) => rule.id === "schedule-rails")?.status, "pass");
    assert.equal(playbook.rules.find((rule) => rule.id === "photo-story-pairing")?.status, "pass");
    assert.notEqual(playbook.rules.find((rule) => rule.id === "white-space-repair")?.status, "fail");
  });

  it("adds a Porter-guided sparse blueprint for the Trilogy low-word photo packet", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 100, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 29, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg", "Legacy 2.jpg"] },
        { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chefs Circle.heic"] },
        { ...article("music", "Music to My Ears", 17, "other", "UPLOAD"), imageRefs: ["Music to My Ears.jpg", "Music to My Ears 2.heic"] },
        article("resident", "Resident Council", 21, "other", "UPLOAD"),
        { ...article("outing", "Out & About", 21, "other", "UPLOAD"), imageRefs: ["Out and About.jpg"] },
        { ...article("intergen", "Intergenerational Fun", 22, "other", "UPLOAD"), imageRefs: ["Intergenerational Fun.jpg"] },
        article("happy", "Happy Hours", 21, "event-recap", "UPLOAD"),
        article("socials", "Socials", 16, "event-recap", "UPLOAD"),
        article("brunch", "Brunch", 3, "announcement", "UPLOAD"),
      ],
      images: [
        { ...image("legacy-1", "landscape", "UPLOAD"), caption: "Legacy.jpg" },
        { ...image("legacy-2", "landscape", "UPLOAD"), caption: "Legacy 2.jpg" },
        { ...image("chef-img", "landscape", "UPLOAD"), caption: "Chefs Circle.heic" },
        { ...image("music-1", "landscape", "UPLOAD"), caption: "Music to My Ears.jpg" },
        { ...image("music-2", "landscape", "UPLOAD"), caption: "Music to My Ears 2.heic" },
        { ...image("outing-img", "landscape", "UPLOAD"), caption: "Out and About.jpg" },
        { ...image("intergen-img", "landscape", "UPLOAD"), caption: "Intergenerational Fun.jpg" },
      ],
    });

    const blueprint = result.candidates.find((candidate) => candidate.id === "source-porter-guided-sparse");
    assert.ok(blueprint, "expected Porter-guided sparse blueprint candidate");
    assert.ok(result.chosen.id.startsWith("source-"));
    assert.equal(result.chosen.warnings.some((warning) => warning.startsWith("porter-critical:")), false);
    assert.equal(blueprint.label, "Uploaded source Porter composition: Porter-guided sparse blueprint");
    assert.ok(blueprint.warnings.includes("porter-photo-pairing:5/5"));

    const happy = blueprint.layout.blocks.find((block) => block.slotId === "source-happy");
    const socials = blueprint.layout.blocks.find((block) => block.slotId === "source-socials");
    const brunch = blueprint.layout.blocks.find((block) => block.slotId === "source-brunch");
    assert.deepEqual(happy?.position, { col: 1, row: 1, colSpan: 5, rowSpan: 7 });
    assert.deepEqual(socials?.position, { col: 1, row: 8, colSpan: 5, rowSpan: 5 });
    assert.deepEqual(brunch?.position, { col: 1, row: 13, colSpan: 5, rowSpan: 4 });

    const director = blueprint.layout.blocks.find((block) => block.articleId === "director");
    assert.deepEqual(director?.position, { col: 6, row: 1, colSpan: 9, rowSpan: 6 });
    assert.equal(director?.style?.panelRole, "directorCorner");

    const chef = blueprint.layout.blocks.find((block) => block.articleId === "chef");
    const chefImage = blueprint.layout.blocks.find((block) => block.imageId === "chef-img");
    const music = blueprint.layout.blocks.find((block) => block.articleId === "music");
    const musicImage = blueprint.layout.blocks.find((block) => block.imageId === "music-1");
    const legacy = blueprint.layout.blocks.find((block) => block.articleId === "legacy");
    const legacyImage = blueprint.layout.blocks.find((block) => block.imageId === "legacy-1");
    assert.deepEqual(legacy?.position, { col: 15, row: 1, colSpan: 10, rowSpan: 2 });
    assert.deepEqual(legacyImage?.position, { col: 15, row: 3, colSpan: 10, rowSpan: 4 });
    assert.equal(chef?.page, 1);
    assert.equal(chefImage?.page, 1);
    assert.ok(chef && chefImage && Math.abs(chefImage.position.row - chef.position.row) <= chef.position.rowSpan);
    assert.equal(musicImage?.page, music?.page);
    assert.ok(music && musicImage && Math.abs(musicImage.position.row - music.position.row) <= music.position.rowSpan);

    const outing = blueprint.layout.blocks.find((block) => block.articleId === "outing");
    const outingImage = blueprint.layout.blocks.find((block) => block.imageId === "outing-img");
    const intergen = blueprint.layout.blocks.find((block) => block.articleId === "intergen");
    const intergenImage = blueprint.layout.blocks.find((block) => block.imageId === "intergen-img");
    assert.equal(outingImage?.page, outing?.page);
    assert.equal(intergenImage?.page, intergen?.page);

    const placedImages = blueprint.layout.blocks.filter((block) => block.imageId);
    assert.equal(placedImages.length, 7);
    assert.ok(
      placedImages.some((block) => block.page === 2 && block.position.rowSpan >= 10),
      "page 2 should turn reclaimed sparse-copy space into a strong photo mass",
    );

    for (const block of blueprint.layout.blocks) {
      assert.ok(block.position.col >= 1);
      assert.ok(block.position.row >= 1);
      assert.ok(block.position.col + block.position.colSpan - 1 <= 24);
      assert.ok(block.position.row + block.position.rowSpan - 1 <= 16);
    }
    for (const [index, block] of blueprint.layout.blocks.entries()) {
      for (const other of blueprint.layout.blocks.slice(index + 1)) {
        if (block.page !== other.page) continue;
        const overlap: boolean = !(
          block.position.col + block.position.colSpan - 1 < other.position.col ||
          other.position.col + other.position.colSpan - 1 < block.position.col ||
          block.position.row + block.position.rowSpan - 1 < other.position.row ||
          other.position.row + other.position.rowSpan - 1 < block.position.row
        );
        assert.equal(overlap, false, `blocks ${block.slotId} and ${other.slotId} should not overlap`);
      }
    }
  });

  it("routes eight-module generic-photo Porter uploads into compound dense candidates", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      recurringSections: [],
      articles: [
        article("director", "Executive Director Corner", 110, "executive-note", "UPLOAD"),
        { ...article("legacy", "Legacy News", 48, "resident-story", "UPLOAD"), imageRefs: ["photo1.jpg"] },
        { ...article("anniversary", "Anniversary Celebration", 45, "announcement", "UPLOAD"), imageRefs: ["photo2.jpg"] },
        { ...article("chef", "Chef Circle", 42, "announcement", "UPLOAD"), imageRefs: ["photo3.jpg"] },
        article("resident", "Resident Council", 26, "other", "UPLOAD"),
        article("happy", "Happy Hours", 28, "event-recap", "UPLOAD"),
        article("socials", "Socials", 24, "event-recap", "UPLOAD"),
        article("brunch", "Brunch", 16, "announcement", "UPLOAD"),
      ],
      images: [
        { ...image("upload-a", "landscape", "UPLOAD"), caption: "Campus group.jpg" },
        { ...image("upload-b", "landscape", "UPLOAD"), caption: "Activity photo.jpg" },
        { ...image("upload-c", "portrait", "UPLOAD"), caption: "Resident moment.jpg" },
      ],
    });

    assert.ok(result.candidates.some((candidate) => candidate.id === "source-porter-guided-sparse"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "source-compact-director-mosaic"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "source-story-river"));
    assert.ok(result.candidates.some((candidate) => candidate.id === "source-photo-stair"));

    const blueprint = result.candidates.find((candidate) => candidate.id === "source-compact-director-mosaic");
    assert.ok(blueprint, "expected compact Porter candidate for eight-module packet");
    assert.equal(result.chosen.id, "source-compact-director-mosaic");
    assert.equal(blueprint.label, "Uploaded source Porter composition: compact director mosaic");
    assert.ok(
      blueprint.warnings.some((warning) => warning.startsWith("porter-unmatched-photo-refs:3:")),
      "generic DOCX photo refs should stay visible as a pairing warning",
    );
    assert.ok(
      blueprint.warnings.includes("porter-photo-pairing:0/3"),
      "generic fallback photos should no longer certify source photo/story pairing",
    );
    assert.ok(
      blueprint.warnings.some((warning) => warning.startsWith("porter-warning:source-photo-unresolved")),
      "unresolved generic refs should stay visible without becoming hard failures",
    );
    assert.notEqual(
      blueprint.layout.blocks.find((block) => block.articleId === "anniversary")?.style?.panelRole,
      "birthday",
      "anniversary content should remain a story/announcement compound unit, not a birthday card",
    );
    const compactSchedules = blueprint.layout.blocks.filter((block) =>
      block.kind === "list" && block.position.colSpan <= 6
    );
    assert.ok(compactSchedules.length >= 2, "dated rows should become compact schedule rails");
    assert.ok(
      blueprint.layout.blocks.some((block) => block.articleId === "director" && block.position.row <= 3),
      "director should still anchor the first inner page",
    );
    const pairedImages = blueprint.layout.blocks.filter((block) => block.imageId);
    assert.equal(pairedImages.length, 3, "all three uploaded images should be used");
    assert.ok(
      pairedImages.some((block) => block.page === 2 && block.position.colSpan >= 16),
      "compact packet should reserve a strong second-page photo anchor",
    );
    assert.ok(
      new Set(blueprint.layout.blocks.filter((block) => block.articleId || block.kind === "list").map((block) => block.position.colSpan)).size >= 4,
      "compact packet should avoid repeated same-width boxes",
    );
  });

  it("uses compact director mosaic for WillsInitial-style seven-photo generic uploads", () => {
    const articles = [
      article("director", "Executive Director Corner", 167, "executive-note", "UPLOAD"),
      { ...article("legacy", "Legacy News", 29, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg", "Legacy 2.jpg"] },
      { ...article("chef", "Chef Circle", 50, "announcement", "UPLOAD"), imageRefs: ["Chefs Circle.jpg"] },
      {
        ...article(
          "campus",
          "Campus in Color is a Vibrant Celebration of Creativity, community and self-expression",
          39,
          "announcement",
          "UPLOAD",
        ),
        imageRefs: ["Campus in Color.jpg", "Campus in Color 2.HEIC"],
      },
      article("anniversary", "The Oaks at Jamestown is Proud to celebrate its second anniversary", 89, "announcement", "UPLOAD"),
      article("happy", "Happy Hours", 23, "event-recap", "UPLOAD"),
      article("socials", "Socials", 14, "event-recap", "UPLOAD"),
      article("brunch", "Brunch", 3, "announcement", "UPLOAD"),
    ];
    const images = Array.from({ length: 7 }, (_, index) => ({
      ...image(`photo-${index + 1}`, index % 2 === 0 ? "landscape" : "portrait", "UPLOAD"),
      alt: `photo${index + 1}.jpg`,
    }));

    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      recurringSections: [],
      articles,
      images,
    });

    const compact = result.candidates.find((candidate) => candidate.id === "source-compact-director-mosaic");
    assert.ok(compact, "expected compact candidate for real WillsInitial seven-photo shape");
    assert.equal(result.chosen.id, "source-compact-director-mosaic");
    assert.ok(compact.warnings.some((warning) => warning.startsWith("porter-unmatched-photo-refs:5:")));
    assert.ok(compact.warnings.includes("porter-photo-pairing:0/3"));
    assert.ok(
      compact.warnings.some((warning) => warning.startsWith("porter-warning:source-photo-unresolved")),
      "generic WillsInitial refs should remain unresolved warnings, not certified pairings",
    );
    assert.equal(compact.layout.blocks.filter((block) => block.imageId).length, 7);
    for (const articleId of ["legacy", "chef", "campus"]) {
      const story = compact.layout.blocks.find((block) => block.articleId === articleId);
      const pairedPhoto = compact.layout.blocks.find((block) =>
        block.imageId &&
        block.page === story?.page &&
        block.caption &&
        block.caption.toLowerCase().includes((articles.find((article) => article.id === articleId)?.title ?? "").toLowerCase().slice(0, 12)),
      );
      assert.ok(story && pairedPhoto, `${articleId} should have a same-page semantic fallback photo pair`);
    }

    const playbook = evaluatePorterLayoutPlaybook({
      layout: compact.layout,
      articles,
      images,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      referenceFamily: "dense-lavender-grid",
    });
    assert.equal(playbook.rules.find((rule) => rule.id === "photo-story-pairing")?.status, "fail");
    assert.equal(playbook.rules.find((rule) => rule.id === "hard-source-invariants")?.status, "pass");
  });

  it("uses community-collage principles for source packets with long events and photo stories", () => {
    const articles = [
      {
        ...article("birthday", "Happy Birthday!", 42, "birthday", "UPLOAD"),
        body: "RESIDENTS\nJerry L. 7/8\nMichael J. 7/12\nSTAFF\nCarla M. 7/3",
      },
      {
        ...article("director", "Executive Director Corner", 190, "executive-note", "UPLOAD"),
        imageRefs: ["Director Portrait.jpg"],
      },
      {
        ...article("outings", "Outings", 70, "other", "UPLOAD"),
        body: "Residents joined weekly outings for scenic rides, lunch, and sweet treats together.",
        imageRefs: ["Outings 1.jpg", "Outings 2.jpg"],
      },
      {
        ...article("wings", "Wings of Joy Project", 120, "event-recap", "UPLOAD"),
        imageRefs: ["Wings 1.jpg", "Wings 2.jpg"],
      },
      {
        ...article("breakfast", "Men's Breakfast", 48, "event-recap", "UPLOAD"),
        imageRefs: ["Mens Breakfast 1.jpg", "Mens Breakfast 2.jpg"],
      },
      {
        ...article("mothers", "Mother's Day Tea", 60, "event-recap", "UPLOAD"),
        imageRefs: ["Mothers Tea 1.jpg", "Mothers Tea 2.jpg"],
      },
      {
        ...article("events", "Upcoming Events", 90, "event-recap", "UPLOAD"),
        body: [
          "7/1 Music by Greg & Tony",
          "7/2 Men's Breakfast",
          "7/3 Happy Hour with Don",
          "7/9 Picnic in the Park",
          "7/10 Happy Hour",
          "7/14 Country Cruise",
          "7/15 Senior Karaoke",
          "7/17 Happy Hour",
          "7/21 Lunch at Cow Palace",
          "7/22 Music by Tyler Wilson",
          "7/24 Happy Hour",
          "7/31 Happy Hour with Johnny A.",
        ].join("\n"),
      },
    ];
    const images = [
      "Director Portrait.jpg",
      "Outings 1.jpg",
      "Outings 2.jpg",
      "Wings 1.jpg",
      "Wings 2.jpg",
      "Mens Breakfast 1.jpg",
      "Mens Breakfast 2.jpg",
      "Mothers Tea 1.jpg",
      "Mothers Tea 2.jpg",
      "Campus Moment 1.jpg",
      "Campus Moment 2.jpg",
    ].map((caption, index) => ({
      ...image(`community-${index}`, index === 0 ? "portrait" : "landscape", "UPLOAD"),
      caption,
    }));

    const result = buildAdaptiveLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      recurringSections: [],
      articles,
      images,
    });

    const collage = result.candidates.find((candidate) => candidate.id === "source-community-collage");
    assert.ok(collage, "expected reusable community-collage source candidate");
    assert.equal(result.chosen.id, "source-community-collage");

    const birthdayRail = collage.layout.blocks.find((block) => block.slotId === "source-birthday");
    const director = collage.layout.blocks.find((block) => block.articleId === "director");
    const directorPortrait = collage.layout.blocks.find((block) => block.imageId === "community-0");
    const outings = collage.layout.blocks.find((block) => block.articleId === "outings");
    const outingsPhoto = collage.layout.blocks.find((block) => block.imageId === "community-1");
    const eventRail = collage.layout.blocks.find((block) => block.slotId === "source-events");

    assert.equal(birthdayRail?.position.col, 1);
    assert.equal(birthdayRail?.position.row, 1);
    assert.ok((birthdayRail?.position.colSpan ?? 0) <= 6, "birthday stays a narrow rail");
    assert.ok((birthdayRail?.position.rowSpan ?? 0) >= 6, "birthday rail grows with roster rows");
    assert.equal(birthdayRail?.style?.panelRole, "birthday");
    assert.equal(director?.page, 1);
    assert.ok((director?.position.col ?? 99) > (birthdayRail?.position.col ?? 0), "director anchors beside the birthday rail");
    assert.equal(director?.style?.panelRole, "directorCorner");
    assert.equal(directorPortrait?.page, 1);
    assert.equal(outings?.kind, "article", "narrative outings with photo refs should not become a schedule rail");
    assert.equal(outingsPhoto?.page, outings?.page);
    assert.equal(eventRail?.position.row, 1);
    assert.equal(eventRail?.position.rowSpan, 16);
    assert.ok((eventRail?.position.colSpan ?? 0) >= 6, "long event list receives a durable side rail");
    assert.equal(eventRail?.style?.panelRole, "upcomingEvents");
    assert.equal(collage.layout.blocks.filter((block) => block.imageId).length, images.length);
    assert.equal(collage.warnings.includes("porter-critical:photo-only-page:1"), false);
    assert.ok(collage.warnings.includes("porter-photo-pairing:5/5"));

    const playbook = evaluatePorterLayoutPlaybook({
      layout: collage.layout,
      articles,
      images,
      gridSpec: { ...gridSpec, columns: 24, rowsPerPage: 16 },
      referenceFamily: "community-collage",
    });
    assert.equal(playbook.rules.find((rule) => rule.id === "schedule-rails")?.status, "pass");
    assert.equal(playbook.rules.find((rule) => rule.id === "photo-story-pairing")?.status, "pass");
    assert.equal(playbook.rules.find((rule) => rule.id === "no-photo-only-pages")?.status, "pass");
  });

  it("vetoes photo-only inner pages as a Porter critical failure", () => {
    const result = buildAdaptiveLayout({
      templateId: "v3-test",
      pageCount: 2,
      gridSpec,
      recurringSections: [],
      articles: [article("lead", "Community Story", 100, "announcement", "UPLOAD")],
      images: [image("photo-a", "landscape", "UPLOAD"), image("photo-b", "landscape", "UPLOAD")],
    });
    const photoOnly = {
      ...result.candidates[0],
      id: "photo-only-page",
      score: 0.9,
      layout: simpleLayout("v3-test", [
        {
          blockId: "story",
          slotId: "story",
          page: 1,
          position: { col: 1, row: 1, colSpan: 12, rowSpan: 4 },
          kind: "article",
          articleId: "lead",
          needsFiller: false,
          zIndex: 0,
        },
        {
          blockId: "photo",
          slotId: "photo",
          page: 2,
          position: { col: 1, row: 1, colSpan: 12, rowSpan: 10 },
          kind: "image",
          imageId: "photo-a",
          needsFiller: false,
          zIndex: 0,
        },
      ]),
      warnings: ["porter-critical:photo-only-page:1"],
    };
    const editorial = { ...result.candidates[1], id: "editorial-page", score: 0.5, warnings: [] };

    assert.equal(chooseAdaptiveCandidate([photoOnly, editorial], "photo-only-veto").id, "editorial-page");
  });

  it("fails photo and rendered-quality playbook rules when loaded images are placeholders", () => {
    const layout = simpleLayout("v3-test", [
      {
        blockId: "story",
        slotId: "story",
        page: 1,
        position: { col: 1, row: 1, colSpan: 6, rowSpan: 4 },
        kind: "article",
        articleId: "legacy",
        needsFiller: false,
      },
      {
        blockId: "photo",
        slotId: "photo",
        page: 1,
        position: { col: 7, row: 1, colSpan: 6, rowSpan: 4 },
        kind: "image",
        imageId: "legacy-photo",
        caption: "Legacy News",
        needsFiller: false,
      },
    ]);

    const playbook = evaluatePorterLayoutPlaybook({
      layout,
      articles: [{ ...article("legacy", "Legacy News", 30, "resident-story", "UPLOAD"), imageRefs: ["Legacy.jpg"] }],
      images: [{ ...image("legacy-photo", "landscape", "UPLOAD"), caption: "Legacy.jpg" }],
      gridSpec,
      referenceFamily: "dense-lavender-grid",
      measurement: {
        candidateId: "candidate",
        clippedBlocks: 0,
        overflowBlocks: 0,
        missingImages: 0,
        renderedImages: 1,
        placeholderImages: 1,
        realRenderedImages: 0,
        totalImages: 1,
        usefulOccupancy: 0.8,
        geometricCoverage: 0.9,
        minPageUtility: 0.76,
        largestEmptyBandRatio: 0,
        lowUtilityBlocks: 0,
        underfilledBlocks: 2,
      },
    });

    assert.equal(playbook.rules.find((rule) => rule.id === "photo-use-captions")?.status, "fail");
    assert.equal(playbook.rules.find((rule) => rule.id === "rendered-quality-gate")?.status, "fail");
  });

  it("creates a photo band expansion candidate by compressing the band above it", () => {
    const bandGrid: GridSpec = {
      label: "photo-band-test",
      columns: 12,
      rowsPerPage: 10,
      slots: [
        slot("top-left", "body", 1, 1, 1, 6, 5, 120),
        slot("top-right", "body", 1, 7, 1, 6, 5, 120),
        slot("band-a", "image", 1, 1, 6, 4, 3),
        slot("band-b", "image", 1, 5, 6, 4, 3),
        slot("band-c", "image", 1, 9, 6, 4, 3),
      ],
    };
    const result = buildAdaptiveLayout({
      templateId: "v3-photo-band-test",
      pageCount: 1,
      gridSpec: bandGrid,
      recurringSections: [],
      articles: [
        article("lead", "Meet Dorothy", 120, "resident-story"),
        article("event", "Summer Concert Recap", 90, "event-recap"),
      ],
      images: [image("a"), image("b"), image("c")],
    });
    const expanded = result.candidates.find(
      (candidate) => candidate.geometryVariant === "photo-band-expand",
    );

    assert.ok(expanded, "expected a photo band expansion candidate");
    const topLeft = expanded.layout.blocks.find((block) => block.slotId === "top-left");
    const imageA = expanded.layout.blocks.find((block) => block.slotId === "band-a");
    assert.ok(topLeft);
    assert.ok(imageA);
    assert.equal(topLeft.position.rowSpan, 2);
    assert.equal(imageA.position.row, 3);
    assert.equal(imageA.position.rowSpan, 6);
    assert.ok(expanded.subscores.geometryValidity > 0.99);
  });
});

interface DemoVarietyScenario {
  name: string;
  articles: Article[];
  images: NewsImage[];
  expectedGrammar:
    | "lead-story-collage"
    | "events-and-milestones"
    | "director-note-feature"
    | "photo-recap-spread"
    | "mixed-briefs";
  expectedPersonality:
    | "classic-community"
    | "garden-warmth"
    | "photo-journal"
    | "resident-spotlight"
    | "editorial-calm"
    | "celebration-pop";
  brandVoice?: string;
  clientName?: string;
}

function measurementFor(
  candidate: AdaptiveLayoutCandidate,
  expectedGrammar: DemoVarietyScenario["expectedGrammar"],
): CandidateMeasurement {
  const imageCount = candidate.layout.blocks.filter((block) => block.imageId).length;
  const grammarAligned =
    expectedGrammar === "mixed-briefs" || candidate.subscores.grammarAffinity >= 1;
  const underfilled = candidate.subscores.occupancy < 0.7;
  const lowUtilityBlocks = grammarAligned ? 0 : underfilled ? 3 : 2;

  return {
    candidateId: candidate.id,
    clippedBlocks: grammarAligned ? 0 : 2,
    overflowBlocks: 0,
    missingImages: 0,
    renderedImages: imageCount,
    totalImages: imageCount,
    usefulOccupancy: grammarAligned ? 0.88 : underfilled ? 0.52 : 0.62,
    lowUtilityBlocks,
  };
}

function acceptedCandidate(
  scenario: DemoVarietyScenario,
): ReturnType<typeof buildAdaptiveLayout>["chosen"] {
  const planned = buildAdaptiveLayout({
    templateId: `v3-variety-${scenario.name}`,
    pageCount: 2,
    gridSpec,
    recurringSections: [],
    articles: scenario.articles,
    images: scenario.images,
    brandVoice: scenario.brandVoice,
    clientName: scenario.clientName,
    variationSeed: scenario.name,
  });
  const measured = applyCandidateMeasurements(
    planned.candidates,
    planned.candidates.map((candidate) => measurementFor(candidate, scenario.expectedGrammar)),
  );
  const chosen = chooseAdaptiveCandidate(measured, scenario.name);

  assert.equal(planned.plan.compositionGrammar, scenario.expectedGrammar, scenario.name);
  assert.equal(planned.plan.visualPersonality, scenario.expectedPersonality, scenario.name);
  assert.equal(planned.candidates.length, 8, scenario.name);
  assert.ok(chosen.subscores.renderFit != null, scenario.name);
  assert.ok(chosen.subscores.renderFit >= 0.99, scenario.name);
  assert.ok(chosen.subscores.usefulOccupancy != null, scenario.name);
  assert.ok(chosen.subscores.usefulOccupancy >= 0.82, scenario.name);
  assert.equal(chosen.measurement?.clippedBlocks, 0, scenario.name);
  assert.equal(chosen.measurement?.overflowBlocks, 0, scenario.name);
  assert.equal(chosen.measurement?.missingImages, 0, scenario.name);
  assert.ok(!chosen.warnings.some((warning) => warning.startsWith("render-clipped-blocks")), scenario.name);
  assert.ok(!chosen.warnings.some((warning) => warning.startsWith("low-utility-blocks")), scenario.name);

  return chosen;
}

describe("adaptiveLayoutPlanner demo variety acceptance", () => {
  const scenarios: DemoVarietyScenario[] = [
    {
      name: "director-note-with-resident-feature",
      articles: [
        article("resident", "Meet Evelyn", 210, "resident-story"),
        article("director", "From the Executive Director", 150, "executive-note"),
        article("event", "Summer Courtyard Concert", 110, "event-recap"),
        article("volunteer", "Make the Difference", 55, "announcement"),
      ],
      images: [image("portrait", "portrait", "UPLOAD"), image("concert", "landscape")],
      expectedGrammar: "director-note-feature",
      expectedPersonality: "garden-warmth",
      brandVoice: "Warm, friendly, community-focused and home-like",
    },
    {
      name: "photo-recap-with-short-copy",
      articles: [
        article("recap", "Luau Photo Recap", 85, "event-recap"),
        article("brief", "Around Campus", 55, "announcement"),
      ],
      images: Array.from({ length: 7 }, (_, index) =>
        image(`recap-photo-${index}`, index % 2 === 0 ? "landscape" : "portrait"),
      ),
      expectedGrammar: "photo-recap-spread",
      expectedPersonality: "photo-journal",
    },
    {
      name: "events-and-milestones-calendar",
      articles: [
        article("birthdays", "August Birthdays", 70, "birthday"),
        article("happy-hour", "Happy Hour Schedule", 90, "announcement"),
        article("outing", "Out and About", 120, "event-recap"),
        article("notice", "Family Night RSVP", 65, "announcement"),
      ],
      images: [image("outing-a"), image("outing-b")],
      expectedGrammar: "events-and-milestones",
      expectedPersonality: "editorial-calm",
      brandVoice: "Classic, refined, calm monthly newsletter",
    },
    {
      name: "dense-mixed-announcements",
      articles: Array.from({ length: 15 }, (_, index) =>
        article(`brief-${index}`, `Campus Brief ${index + 1}`, 130, "announcement"),
      ),
      images: [],
      expectedGrammar: "mixed-briefs",
      expectedPersonality: "editorial-calm",
    },
  ];

  it("accepts measured winners across weird content/photo mixes without clipping or dead space", () => {
    const winners = scenarios.map(acceptedCandidate);

    assert.ok(new Set(scenarios.map((scenario) => scenario.expectedGrammar)).size >= 4);
    assert.ok(new Set(scenarios.map((scenario) => scenario.expectedPersonality)).size >= 3);
    assert.ok(new Set(winners.map((winner) => winner.geometryVariant)).size >= 2);
    assert.ok(new Set(winners.map(geometrySignature)).size >= 3);
  });
});
