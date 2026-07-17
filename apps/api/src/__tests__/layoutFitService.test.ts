import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  pickBestTemplate,
  fitContent,
  type ScoreableTemplate,
} from "../services/layoutFitService.js";
import type { Article, NewsImage, TemplateSlot } from "@newsforge/shared/schemas";

function slot(
  id: string,
  page: number,
  type: TemplateSlot["type"],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  capacity: TemplateSlot["capacity"] = {},
  styleTag?: string,
): TemplateSlot {
  return { id, page, type, col, row, colSpan, rowSpan, capacity, styleTag };
}

function tmpl(id: string, slots: TemplateSlot[], pageCount = 4): ScoreableTemplate {
  return {
    id,
    pageCount,
    gridSpec: { label: id, columns: 12, rowsPerPage: 10, slots },
  };
}

function makeArticle(
  id: string,
  wordCount: number,
  body?: string,
  articleType?: Article["articleType"],
): Article {
  return {
    id,
    title: `t-${id}`,
    body: body ?? Array(wordCount).fill("word").join(" "),
    wordCount,
    isFiller: false,
    source: "MOCK",
    articleType,
  };
}

function makeImage(id: string, aspect: NewsImage["aspect"] = "landscape"): NewsImage {
  return {
    id,
    url: `/uploads/${id}.jpg`,
    aspect,
    isPlaceholder: false,
    source: "MOCK",
  };
}

describe("layoutFitService.pickBestTemplate", () => {
  const featureHeavy = tmpl("t-feature", [
    slot("s1", 1, "headline", 1, 1, 12, 1, { maxWords: 12 }, "hero"),
    slot("s2", 1, "image", 1, 2, 12, 4, { aspect: "landscape" }, "hero"),
    slot("s3", 1, "body", 1, 6, 12, 4, { minWords: 300, maxWords: 500 }),
    slot("s4", 2, "body", 1, 1, 6, 5, { maxWords: 200 }),
  ]);

  const photoHeavy = tmpl("t-photo", [
    slot("p1", 1, "headline", 1, 1, 12, 1, { maxWords: 20 }),
    slot("p2", 1, "image", 1, 2, 4, 5),
    slot("p3", 1, "image", 5, 2, 4, 5),
    slot("p4", 1, "image", 9, 2, 4, 5),
    slot("p5", 1, "image", 1, 7, 6, 4),
    slot("p6", 1, "image", 7, 7, 6, 4),
  ]);

  const textHeavy = tmpl("t-text", [
    slot("x1", 1, "headline", 1, 1, 12, 1, { maxWords: 20 }),
    slot("x2", 1, "body", 1, 2, 6, 8, { minWords: 400, maxWords: 600 }),
    slot("x3", 1, "body", 7, 2, 6, 8, { minWords: 400, maxWords: 600 }),
    slot("x4", 2, "body", 1, 1, 12, 10, { maxWords: 800 }),
  ]);

  const candidates = [featureHeavy, photoHeavy, textHeavy];

  it("picks feature-heavy template when a resident-story is present", () => {
    const articles = [
      makeArticle("a1", 400, undefined, "resident-story"),
    ];
    const images = [makeImage("i1")];
    const r = pickBestTemplate(articles, images, candidates);
    assert.equal(r.chosenTemplateId, "t-feature");
    assert.ok(r.candidates.length === 3);
  });

  it("picks photo-heavy when there are many images and few articles", () => {
    const articles = [makeArticle("a1", 60)];
    const images = Array.from({ length: 5 }, (_, i) => makeImage(`i${i}`));
    const r = pickBestTemplate(articles, images, candidates);
    assert.equal(r.chosenTemplateId, "t-photo");
  });

  it("penalises photo-heavy template with too few images", () => {
    const articles = [makeArticle("a1", 250)];
    const images: NewsImage[] = [];
    const r = pickBestTemplate(articles, images, candidates);
    // The photo-heavy candidate should score its photoCount at 0 for empty
    // image supply (5 image slots, 0 images) — that's the specific penalty.
    const photoCand = r.candidates.find((c) => c.templateId === "t-photo");
    assert.ok(photoCand, "expected photo-heavy candidate in report");
    assert.equal(photoCand?.subscores.photoCount, 0);
  });

  it("handles too many articles (overflow) — deterministic winner", () => {
    const articles = Array.from({ length: 12 }, (_, i) =>
      makeArticle(`a${i}`, 300, undefined, i === 0 ? "resident-story" : "other"),
    );
    const images = Array.from({ length: 3 }, (_, i) => makeImage(`i${i}`));
    const r = pickBestTemplate(articles, images, candidates);
    // deterministic — the same inputs must produce the same result.
    const r2 = pickBestTemplate(articles, images, candidates);
    assert.equal(r.chosenTemplateId, r2.chosenTemplateId);
  });

  it("handles mixed articleTypes without throwing", () => {
    const articles = [
      makeArticle("a1", 300, undefined, "resident-story"),
      makeArticle("a2", 200, undefined, "announcement"),
      makeArticle("a3", 100, undefined, "birthday"),
      makeArticle("a4", 250, undefined, "event-recap"),
    ];
    const images = [makeImage("i1"), makeImage("i2")];
    const r = pickBestTemplate(articles, images, candidates);
    assert.ok(r.chosenTemplateId);
    assert.ok(r.candidates.every((c) => c.score >= 0 && c.score <= 1));
  });

  it("returns empty result on empty candidates", () => {
    const r = pickBestTemplate([], [], []);
    assert.equal(r.chosenTemplateId, "");
    assert.equal(r.candidates.length, 0);
  });
});

describe("layoutFitService.fitContent", () => {
  const template = tmpl("t-mixed", [
    slot("s1", 1, "headline", 1, 1, 12, 1, { maxWords: 12 }),
    slot("s2", 1, "body", 1, 2, 12, 4, { maxWords: 50 }),
    slot("s3", 1, "image", 1, 6, 6, 4),
    slot("s4", 1, "image", 7, 6, 6, 4),
  ]);

  it("truncates overflow body at sentence boundary", () => {
    const longBody =
      "First sentence here. Second sentence here! Third sentence continues. Fourth ends. " +
      Array(200).fill("filler").join(" ") + ".";
    const article = makeArticle("a1", 220, longBody);
    // s1 is headline (12 words), s2 is body (50 words). Articles are paired
    // to article slots in order: a1 -> s1 headline (12 max).
    const result = fitContent([article], [], template);
    const fit = result.articleFit[0];
    assert.equal(fit.articleId, "a1");
    assert.equal(fit.trimmed, true);
    assert.ok(fit.wordsOut <= 20); // headline max was 12; sentence boundary may overshoot slightly
    // trimmed body ends on sentence delimiter
    const trimmedBody = result.articles[0].body;
    assert.match(trimmedBody, /[.!?]$/);
  });

  it("drops last-uploaded photos when over-supplied", () => {
    const images = [
      makeImage("i-old-1"),
      makeImage("i-old-2"),
      makeImage("i-new-1"),
      makeImage("i-new-2"),
    ];
    // Template has 2 image slots.
    const result = fitContent([], images, template);
    assert.equal(result.keptImages.length, 2);
    assert.deepEqual(
      result.keptImages.map((i) => i.id),
      ["i-old-1", "i-old-2"],
    );
    assert.equal(result.droppedImageIds.length, 2);
    assert.ok(result.warnings.some((w) => w.startsWith("photo-unused")));
  });

  it("warns when photos are under-supplied", () => {
    const result = fitContent([], [makeImage("i1")], template);
    // Only 1 image, 2 image slots.
    assert.ok(
      result.warnings.some((w) => w.includes("photos-under-supplied")),
    );
    assert.equal(result.droppedImageIds.length, 0);
  });

  it("passes small articles through unchanged", () => {
    const article = makeArticle("a1", 5, "Short body here today okay.");
    const result = fitContent([article], [], template);
    // s1 headline maxWords=12, article is 5 words — no trim.
    assert.equal(result.articleFit[0].trimmed, false);
    assert.equal(result.articles[0].body, article.body);
  });
});
