import assert from "node:assert/strict";
import test from "node:test";
import { AiEditDiffSchema } from "@newsforge/shared/schemas";

test("AI edit diff accepts Gemini object summaries and normalizes them", () => {
  const parsed = AiEditDiffSchema.parse({
    added: [{ blockId: "new-section", reason: "Inserted calendar panel" }],
    removed: [{ id: "old-photo" }],
    modified: [
      { blockId: "hero-title", change: "warmer heading" },
      { summary: "Adjusted event list hierarchy" },
    ],
    summary: "Polished layout hierarchy.",
  });

  assert.deepEqual(parsed, {
    added: ["new-section"],
    removed: ["old-photo"],
    modified: ["hero-title", "Adjusted event list hierarchy"],
    summary: "Polished layout hierarchy.",
  });
});
