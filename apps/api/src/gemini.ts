/**
 * Gemini 2.5 Flash wrapper.
 *
 * Rules from Vitaly:
 *   - 7s timeout, 2 retries
 *   - Zod-validated response
 *   - Deterministic fallback when Gemini fails or is not configured
 *   - Called from backend ONLY (key from env)
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { env } from "./env.js";

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 7_000;
const MAX_RETRIES = 2;

let client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  if (!env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Gemini timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
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
      const result = await withTimeout(
        model.generateContent(opts.userPrompt),
        TIMEOUT_MS,
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
