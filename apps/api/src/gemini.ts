/**
 * Gemini 2.5 Flash wrapper.
 *
 * Rules from Vitaly:
 *   - abortable timeout, bounded retry
 *   - Zod-validated response
 *   - Deterministic fallback when Gemini fails or is not configured
 *   - Called from backend ONLY (key from env)
 */
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { z } from "zod";
import { env } from "./env.js";

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  if (!env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

async function generateContentWithTimeout(
  model: GenerativeModel,
  userPrompt: string,
  ms: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await model.generateContent(userPrompt, {
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Gemini timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJson(text: string): unknown {
  // Strip ```json fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}

export interface GeminiCallOptions<T> {
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  /** Deterministic value to return if Gemini fails or isn't configured. */
  fallback: T;
  /** v3 — per-call timeout override (layout design needs more than 7s). */
  timeoutMs?: number;
}

/**
 * Call Gemini with strict JSON output, validate against schema, retry once,
 * and fall back deterministically. Never throws to caller.
 */
export async function callGeminiJson<T>(
  opts: GeminiCallOptions<T>,
): Promise<{ ok: true; data: T; usedFallback: false } | { ok: true; data: T; usedFallback: true; reason: string }> {
  const c = getClient();
  if (!c) {
    return {
      ok: true,
      data: opts.fallback,
      usedFallback: true,
      reason: "GEMINI_API_KEY not configured",
    };
  }

  const model = c.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
    systemInstruction: opts.systemPrompt,
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateContentWithTimeout(
        model,
        opts.userPrompt,
        opts.timeoutMs ?? TIMEOUT_MS,
      );
      const text = result.response.text();
      const json = extractJson(text);
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) {
        lastErr = new Error(
          `Gemini response failed schema validation: ${parsed.error.message}`,
        );
        continue;
      }
      return { ok: true, data: parsed.data, usedFallback: false };
    } catch (err) {
      lastErr = err;
      // brief backoff
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  console.warn("[gemini] falling back:", lastErr);
  return {
    ok: true,
    data: opts.fallback,
    usedFallback: true,
    reason: String(lastErr instanceof Error ? lastErr.message : lastErr),
  };
}
