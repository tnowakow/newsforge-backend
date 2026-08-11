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
  assert.equal(signature.datedRows, 2);
  assert.equal(signature.wordVolume, 900);
  assert.equal(signature.hasEventRecap, true);
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
