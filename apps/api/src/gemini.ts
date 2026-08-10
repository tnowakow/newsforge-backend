/**
 * AI JSON wrapper. Gemini is the primary provider; OpenAI is the demo backup.
 *
 * Rules from Vitaly:
 *   - abortable timeout, bounded retry
 *   - Zod-validated response
 *   - Deterministic fallback only after configured AI providers fail
 *   - Called from backend ONLY (key from env)
 */
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { z } from "zod";
import { env } from "./env.js";

export const GEMINI_MODEL = "gemini-2.5-flash";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
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

async function callOpenAiWithTimeout(
  systemPrompt: string,
  userPrompt: string,
  ms: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nReturn only valid JSON.`,
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenAI ${response.status}: ${body.slice(0, 220)}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI returned empty content");
    return text;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("OpenAI timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface GeminiCallOptions<T> {
  schema: z.ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  /** Deterministic value to return if Gemini fails or isn't configured. */
  fallback: T;
  /** v3 — per-call timeout override (layout design needs more than 7s). */
  timeoutMs?: number;
  /** Optional retry override for bounded critique/revision calls. */
  maxRetries?: number;
}

type AiJsonSuccess<T> = {
  ok: true;
  data: T;
  usedFallback: false;
  provider: "gemini" | "openai";
  model: string;
  durationMs: number;
};

type AiJsonFallback<T> = {
  ok: true;
  data: T;
  usedFallback: true;
  reason: string;
  provider: "deterministic";
  model: "v3-fallback";
  durationMs: number;
};

/**
 * Call Gemini with strict JSON output, validate against schema, retry once,
 * and fall back deterministically. Never throws to caller.
 */
export async function callGeminiJson<T>(
  opts: GeminiCallOptions<T>,
): Promise<AiJsonSuccess<T> | AiJsonFallback<T>> {
  const startedAt = Date.now();
  const c = getClient();
  let lastErr: unknown = null;

  if (c) {
    const model = c.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
      systemInstruction: opts.systemPrompt,
    });

    for (let attempt = 0; attempt <= (opts.maxRetries ?? MAX_RETRIES); attempt++) {
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
        return {
          ok: true,
          data: parsed.data,
          usedFallback: false,
          provider: "gemini",
          model: GEMINI_MODEL,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        lastErr = err;
        // brief backoff
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  } else {
    lastErr = new Error("GEMINI_API_KEY not configured");
  }

  if (env.OPENAI_API_KEY) {
    for (let attempt = 0; attempt <= (opts.maxRetries ?? MAX_RETRIES); attempt++) {
      try {
        const text = await callOpenAiWithTimeout(
          opts.systemPrompt,
          opts.userPrompt,
          opts.timeoutMs ?? TIMEOUT_MS,
        );
        const json = extractJson(text);
        const parsed = opts.schema.safeParse(json);
        if (!parsed.success) {
          lastErr = new Error(
            `OpenAI response failed schema validation: ${parsed.error.message}`,
          );
          continue;
        }
        return {
          ok: true,
          data: parsed.data,
          usedFallback: false,
          provider: "openai",
          model: env.OPENAI_MODEL,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  } else if (lastErr instanceof Error) {
    lastErr = new Error(`${lastErr.message}; OPENAI_API_KEY not configured`);
  } else {
    lastErr = new Error(`${String(lastErr)}; OPENAI_API_KEY not configured`);
  }

  console.warn("[ai-json] falling back:", lastErr);
  return {
    ok: true,
    data: opts.fallback,
    usedFallback: true,
    reason: String(lastErr instanceof Error ? lastErr.message : lastErr),
    provider: "deterministic",
    model: "v3-fallback",
    durationMs: Date.now() - startedAt,
  };
}
