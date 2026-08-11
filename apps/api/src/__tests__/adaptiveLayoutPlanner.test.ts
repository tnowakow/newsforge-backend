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
