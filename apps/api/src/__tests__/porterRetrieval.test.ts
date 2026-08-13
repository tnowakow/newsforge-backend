import assert from "node:assert/strict";
import test from "node:test";
import { computePorterContentSignature, retrievePorterExamples } from "../services/porterRetrieval.js";

const article = (overrides: Partial<{ title: string; body: string; wordCount: number; articleType: "resident-story" | "event-recap" | "announcement" }> = {}) => ({
  id: `a-${Math.random()}`,
  title: overrides.title ?? "Community update",
  body: overrides.body ?? "A useful community story.",
  wordCount: overrides.wordCount ?? 120,
  isFiller: false,
  source: "MOCK" as const,
  articleType: overrides.articleType ?? "announcement",
});

const image = (id: string) => ({
  id,
  url: `https://example.test/${id}.jpg`,
  aspect: "landscape" as const,
  source: "MOCK" as const,
  isPlaceholder: false,
  tags: [],
});

test("computes the content signature used by Porter retrieval", () => {
  const signature = computePorterContentSignature(
    [article({ body: "Join us on June 12 and July 4 for a resident event.", wordCount: 900, articleType: "event-recap" })],
    [image("1"), image("2"), image("3")],
  );
  assert.equal(signature.photoCount, 3);
  assert.equal(signature.moduleCount, 1);
  assert.equal(signature.datedRows, 2);
  assert.equal(signature.wordVolume, 900);
  assert.equal(signature.hasEventRecap, true);
});

test("routes low-word source uploads with many modules and referenced photos away from editorial light", () => {
  const articles = [
    article({ title: "Executive Director Corner", wordCount: 100 }),
    { ...article({ title: "Legacy News", wordCount: 29, articleType: "resident-story" }), imageRefs: ["Legacy.jpg", "Legacy 2.jpg"] },
    { ...article({ title: "Chef Circle", wordCount: 50 }), imageRefs: ["Chefs Circle.heic"] },
    { ...article({ title: "Music to My Ears", wordCount: 17 }), imageRefs: ["Music to My Ears 2.heic"] },
    article({ title: "Resident Council", wordCount: 21 }),
    article({ title: "Out & About", wordCount: 21 }),
    { ...article({ title: "Intergenerational Fun", wordCount: 22 }), imageRefs: ["Intergenerational Fun.jpg"] },
    article({ title: "Happy Hours", body: "7/3 event 7/10 event 7/17 event 7/24 event 7/31 event", wordCount: 21, articleType: "event-recap" }),
    article({ title: "Socials", body: "7/8 event 7/15 event 7/22 event 7/29 event", wordCount: 16, articleType: "event-recap" }),
    article({ title: "Brunch", body: "7/12 July Brunch", wordCount: 3 }),
  ];
  const result = retrievePorterExamples(articles, Array.from({ length: 5 }, (_, index) => image(String(index))));

  assert.equal(result.signature.moduleCount, 10);
  assert.equal(result.signature.referencedPhotoPairs, 5);
  assert.equal(result.family, "dense-lavender-grid");
  assert.equal(result.scenario, "panel-garden");
  assert.ok(!result.prompt.includes("retrieved family editorial-light"));
});

test("retrieves three nearest Porter exemplars and a plurality family", () => {
  const result = retrievePorterExamples(
    Array.from({ length: 8 }, (_, index) => article({ wordCount: 150, articleType: index === 0 ? "event-recap" : "announcement" })),
    Array.from({ length: 12 }, (_, index) => image(String(index))),
  );
  assert.equal(result.examples.length, 3);
  assert.ok(result.examples.every((example) => example.exampleId.length === 2));
  assert.ok(result.prompt.includes("Retrieved Porter exemplars"));
});

test("routes the July Trilogy signature to the dense lavender family", () => {
  const result = retrievePorterExamples(
    [
      article({ title: "Legacy News", wordCount: 30 }),
      article({ title: "Resident spotlight", wordCount: 180, articleType: "resident-story" }),
      article({ title: "Chef Circle", wordCount: 80 }),
      article({ title: "Event lists", body: "7/3 event 7/8 event 7/10 event 7/12 event 7/15 event 7/17 event 7/22 event 7/24 event 7/29 event 7/31 event", wordCount: 120 }),
    ],
    Array.from({ length: 7 }, (_, index) => image(String(index))),
  );
  assert.equal(result.signature.datedRows, 10);
  assert.equal(result.family, "dense-lavender-grid");
  assert.equal(result.scenario, "panel-garden");
});
