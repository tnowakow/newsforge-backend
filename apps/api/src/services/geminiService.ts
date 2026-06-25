import { z, type ZodSchema } from "zod";
import { env } from "../env.js";
import { log } from "../logger.js";

/**
 * Gemini 2.5 Flash client. Vitaly §3:
 * - 7s hard timeout
 * - 2 retries (250ms, 750ms) on transient 5xx / abort
 * - Structured output via responseSchema when a Zod schema is passed
 * - Caller is responsible for the deterministic fallback when this throws.
 */

export class GeminiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GeminiError";
  }
}

interface CallOpts<T> {
  timeoutMs?: number;
  schema?: ZodSchema<T>;
  temperature?: number;
  maxOutputTokens?: number;
}

function endpoint(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
}

/** Minimal Zod → Gemini schema conversion (sufficient for our discriminated-union shape). */
function toGeminiSchema(_schema: ZodSchema<unknown>): Record<string, unknown> {
  // The Gemini API's responseSchema is a subset of OpenAPI 3.0. For our use we ask the model
  // to return JSON matching our shape; we then re-validate via Zod. This keeps it simple
  // and forward-compatible while still giving us a JSON response.
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string" },
            pageNumber: { type: "integer" },
            blockId: { type: "string" },
            blockIdA: { type: "string" },
            blockIdB: { type: "string" },
            x: { type: "integer" },
            y: { type: "integer" },
            w: { type: "integer" },
            h: { type: "integer" },
            title: { type: "string" },
            body: { type: "string" },
            caption: { type: "string" },
          },
        },
      },
    },
    required: ["summary", "ops"],
  };
}

async function attempt<T>(prompt: string, opts: CallOpts<T>): Promise<{ text: string; ms: number }> {
  if (!env.GEMINI_API_KEY) {
    throw new GeminiError("GEMINI_API_KEY not set");
  }
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 7000);
  try {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        ...(opts.schema
          ? { responseMimeType: "application/json", responseSchema: toGeminiSchema(opts.schema) }
          : {}),
      },
    };
    const res = await fetch(endpoint(), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new GeminiError(`Gemini HTTP ${res.status}: ${t.slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new GeminiError("Empty Gemini response");
    return { text, ms: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callGemini<T>(
  prompt: string,
  opts: CallOpts<T> = {},
): Promise<{ value: T extends void ? string : T; ms: number }> {
  const delays = [0, 250, 750];
  let lastErr: unknown;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const { text, ms } = await attempt(prompt, opts);
      if (opts.schema) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new GeminiError("Gemini returned non-JSON text");
        }
        const out = opts.schema.safeParse(parsed);
        if (!out.success) {
          throw new GeminiError(`Gemini JSON failed Zod: ${JSON.stringify(out.error.flatten()).slice(0, 240)}`);
        }
        return { value: out.data as never, ms };
      }
      return { value: text as never, ms };
    } catch (e) {
      lastErr = e;
      log.warn("gemini_attempt_failed", { attempt: i + 1, err: String(e) });
      // Only retry on abort / transient signal.
      const msg = String(e);
      if (!/abort|HTTP 5|fetch failed|non-JSON|Empty/.test(msg)) {
        throw e instanceof GeminiError ? e : new GeminiError(msg, e);
      }
    }
  }
  throw lastErr instanceof GeminiError ? lastErr : new GeminiError("Gemini exhausted retries", lastErr);
}

/** Convenience: structured ai-edit call with our Zod schema. */
export async function callGeminiForAiEdit<T>(
  prompt: string,
  schema: ZodSchema<T>,
): Promise<{ value: T; ms: number }> {
  const out = await callGemini<T>(prompt, { schema, timeoutMs: 7000, temperature: 0.4 });
  return { value: out.value as T, ms: out.ms };
}

/** Filler-copy call: plain text. */
export async function callGeminiForFillerCopy(prompt: string): Promise<{ value: string; ms: number }> {
  return callGemini(prompt, { timeoutMs: 7000, temperature: 0.8, maxOutputTokens: 800 });
}

/** Re-export z so callers can ad-hoc shapes without importing zod twice. */
export { z };
