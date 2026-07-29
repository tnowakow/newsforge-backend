import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  Article,
  GridSpec,
  NewsImage,
  TemplateSlot,
} from "@newsforge/shared/schemas";
import {
  applyCandidateMeasurements,
  buildAdaptiveLayout,
  chooseAdaptiveCandidate,
  createEditorialPlan,
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
  it("promotes resident stories and uploaded content into required editorial items", () => {
    const articles = [
      article("birthday", "July Birthdays", 60, "birthday"),
      article("lead", "Meet Dorothy", 220, "resident-story"),
      article("upload", "Garden Club Notes", 120, "announcement", "UPLOAD"),
    ];
    const plan = createEditorialPlan(articles, [image("i1")]);
    assert.equal(plan.leadArticleId, "lead");
    assert.ok(plan.requiredArticleIds.includes("lead"));
    assert.ok(plan.requiredArticleIds.includes("upload"));
    assert.equal(plan.photoGoal, "text-led");
  });

  it("marks a photo-led issue when images outweigh stories", () => {
    const plan = createEditorialPlan(
      [article("a1", "Short Recap", 80)],
      Array.from({ length: 6 }, (_, i) => image(`i${i}`)),
    );
    assert.equal(plan.photoGoal, "photo-led");
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

    assert.equal(result.candidates.length, 4);
    assert.ok(result.candidates.some((candidate) => candidate.geometryVariant !== "fixed"));
    assert.ok(result.chosen.score >= 0);
    assert.ok(result.chosen.subscores.geometryValidity > 0.99);
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
});
