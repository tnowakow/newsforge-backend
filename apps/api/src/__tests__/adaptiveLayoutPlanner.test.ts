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
    assert.equal(source.label, "Uploaded source Porter composition");

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
