/**
 * Integration smoke — exercises the deterministic scoring + fit pipeline
 * without hitting the DB or Gemini. Riley's Phase 4 replays this against a
 * live API; this test proves the shape of what she'll see.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickBestTemplate,
  fitContent,
  buildLayoutFitReport,
  type ScoreableTemplate,
} from "../services/layoutFitService.js";
import { runComplianceSync } from "../services/complianceService.js";
import {
  LayoutFitReportSchema,
  ComplianceFlagsSchema,
  type Article,
  type NewsImage,
  type TemplateSlot,
} from "@newsforge/shared/schemas";

// Mini Trilogy T1 shape (subset — enough to score against).
function trilogyT1(): ScoreableTemplate {
  const slots: TemplateSlot[] = [
    { id: "hd", page: 1, type: "headline", col: 7, row: 1, colSpan: 6, rowSpan: 1, capacity: { maxWords: 12 }, styleTag: "hero" },
    { id: "body", page: 1, type: "body", col: 7, row: 2, colSpan: 6, rowSpan: 4, capacity: { minWords: 260, maxWords: 380 }, styleTag: "feature" },
    { id: "hero-img", page: 1, type: "image", col: 7, row: 6, colSpan: 6, rowSpan: 4, capacity: { aspect: "landscape" }, styleTag: "hero" },
    { id: "spot-a", page: 1, type: "body", col: 1, row: 7, colSpan: 2, rowSpan: 2, capacity: { maxWords: 130 }, styleTag: "staff-spot" },
    { id: "spot-b", page: 1, type: "body", col: 3, row: 7, colSpan: 2, rowSpan: 2, capacity: { maxWords: 130 }, styleTag: "staff-spot" },
    { id: "spot-c", page: 1, type: "body", col: 5, row: 7, colSpan: 2, rowSpan: 2, capacity: { maxWords: 130 }, styleTag: "staff-spot" },
    { id: "portrait-a", page: 1, type: "image", col: 1, row: 9, colSpan: 2, rowSpan: 2, capacity: { aspect: "square" }, styleTag: "portrait" },
    { id: "portrait-b", page: 1, type: "image", col: 3, row: 9, colSpan: 2, rowSpan: 2, capacity: { aspect: "square" }, styleTag: "portrait" },
  ];
  return {
    id: "t-trilogy-community-update",
    pageCount: 4,
    gridSpec: { label: "trilogy-cu", columns: 12, rowsPerPage: 10, slots },
  };
}

function trilogyT4(): ScoreableTemplate {
  // Photo-forward: 10 images, 4 articles.
  const imageSlots: TemplateSlot[] = Array.from({ length: 10 }, (_, i) => ({
    id: `img-${i}`,
    page: (i % 3) + 1,
    type: "image" as const,
    col: (i % 3) * 4 + 1,
    row: Math.floor(i / 3) + 1,
    colSpan: 4,
    rowSpan: 5,
    capacity: { aspect: "landscape" as const },
  }));
  const bodySlots: TemplateSlot[] = [
    { id: "recap", page: 1, type: "body", col: 1, row: 7, colSpan: 12, rowSpan: 3, capacity: { maxWords: 240 }, styleTag: "recap" },
    { id: "b2", page: 2, type: "body", col: 1, row: 6, colSpan: 12, rowSpan: 5, capacity: { maxWords: 200 } },
    { id: "b3", page: 3, type: "body", col: 1, row: 6, colSpan: 12, rowSpan: 5, capacity: { maxWords: 200 } },
    { id: "b4", page: 4, type: "body", col: 1, row: 1, colSpan: 12, rowSpan: 10, capacity: { maxWords: 400 } },
  ];
  return {
    id: "t-trilogy-photo-forward",
    pageCount: 4,
    gridSpec: {
      label: "trilogy-pf",
      columns: 12,
      rowsPerPage: 10,
      slots: [...bodySlots, ...imageSlots],
    },
  };
}

describe("integration smoke — synthetic Trilogy run", () => {
  it("assembles a fit report + compliance flags for a Trilogy-shaped submission", () => {
    const articles: Article[] = [
      {
        id: "a1",
        title: "Remembering the Family Picnic",
        body:
          "Grandchildren, dogs, and sunshine — the picnic was a great one. " +
          Array(280).fill("word").join(" ") + ".",
        wordCount: 285,
        isFiller: false,
        source: "UPLOAD",
        articleType: "resident-story",
      },
      {
        id: "a2",
        title: "Welcome to Our Newest Team Members",
        body: "We're pleased to welcome new team members this month. Each brings warmth.",
        wordCount: 15,
        isFiller: false,
        source: "UPLOAD",
        articleType: "announcement",
      },
      {
        id: "a3",
        title: "A Milestone Birthday",
        body:
          "Mary Johnson, January 12, 1938, will celebrate her 89th birthday this month. " +
          "Please join us in the private dining room.",
        wordCount: 25,
        isFiller: false,
        source: "UPLOAD",
        articleType: "birthday",
      },
      {
        id: "a4",
        title: "Green Thumbs at Work",
        body: "The courtyard garden is thriving thanks to our green-thumbed neighbors.",
        wordCount: 12,
        isFiller: false,
        source: "UPLOAD",
        articleType: "resident-story",
      },
    ];

    const images: NewsImage[] = Array.from({ length: 6 }, (_, i) => ({
      id: `img-${i}`,
      url: `/uploads/img-${i}.jpg`,
      aspect: "landscape" as const,
      isPlaceholder: false,
      source: "UPLOAD" as const,
    }));

    const candidates = [trilogyT1(), trilogyT4()];
    const pick = pickBestTemplate(articles, images, candidates);
    // Both are Trilogy templates — must pick one of them.
    assert.ok(["t-trilogy-community-update", "t-trilogy-photo-forward"].includes(pick.chosenTemplateId));

    const chosen = candidates.find((c) => c.id === pick.chosenTemplateId)!;
    const fit = fitContent(articles, images, chosen);
    const report = buildLayoutFitReport({
      articles,
      images,
      candidates,
      chosen,
      pickResult: pick,
      fitResult: fit,
    });

    // Assert LayoutFitReport parses.
    const parsed = LayoutFitReportSchema.parse(report);
    assert.equal(parsed.chosenTemplateId, chosen.id);
    assert.ok(parsed.candidates.length === 2);

    // Assert complianceFlags parses and contains the birthday PII flag.
    const flags = runComplianceSync({ articles, images });
    const parsedFlags = ComplianceFlagsSchema.parse(flags);
    assert.ok(parsedFlags.length >= 1);
    const birth = parsedFlags.find((f) => f.category === "full-birthdate-with-name");
    assert.ok(birth, "expected a full-birthdate-with-name flag");
    assert.equal(birth?.severity, "block");
  });
});
