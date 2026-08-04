import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

test("OpenAI is used before deterministic fallback when Gemini is unavailable", async (t) => {
  process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/newsforge";
  process.env.AI_UNLOCK_PASSWORD ??= "test-password";
  process.env.INTERNAL_RENDER_SECRET ??= "test-secret";
  process.env.GEMINI_API_KEY = "";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-mini";

  t.mock.method(globalThis, "fetch", async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "from-openai",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  const { callGeminiJson } = await import("../gemini.js");
  const result = await callGeminiJson({
    schema: z.object({ answer: z.string() }),
    systemPrompt: "Return JSON.",
    userPrompt: "Return an answer JSON object.",
    fallback: { answer: "fallback" },
  });

  assert.equal(result.usedFallback, false);
  assert.equal(result.data.answer, "from-openai");
  assert.equal(result.provider, "openai");
});
