/**
 * AI edit service. Sends the current layout + user prompt to Gemini,
 * receives a strict { layout, diff } JSON response, validates, and applies.
 * On any failure, returns the original layout with a "failed" status —
 * never throws to caller.
 */
import {
  GeminiEditResponseSchema,
  AssembledLayoutSchema,
  AiEditDiffSchema,
  type AssembledLayout,
  type AiEditDiff,
} from "@newsforge/shared/schemas";
import { callGeminiJson } from "../gemini.js";

/** AI edits send the full current layout plus instructions; real runs can exceed the default Gemini budget. */
const AI_EDIT_TIMEOUT_MS = 90_000;

export interface AiEditInput {
  layout: AssembledLayout;
  prompt: string;
  brandVoice: string;
  clientName: string;
  monthLabel: string;
}

export interface AiEditResult {
  layout: AssembledLayout;
  diff: AiEditDiff;
  status: "applied" | "fallback";
  reason?: string;
}

export async function runAiEdit(input: AiEditInput): Promise<AiEditResult> {
  const fallback = {
    layout: input.layout,
    diff: {
      added: [],
      removed: [],
      modified: [],
      summary: "No changes — AI unavailable or returned invalid response.",
    },
  };

  const systemPrompt = [
    `You are an editorial layout assistant for ${input.clientName}, a senior-living community newsletter.`,
    `Brand voice: ${input.brandVoice}. Month: ${input.monthLabel}.`,
    `You will receive the CURRENT assembled layout JSON and a user instruction.`,
    `Respond with valid JSON only: { "layout": <updated AssembledLayout>, "diff": { "added": [], "removed": [], "modified": [], "summary": "..." } }.`,
    `Preserve all block.blockId values for blocks you do not change.`,
    `Do not change templateId, pageCount, or version — those are managed by the server.`,
  ].join(" ");

  const userPrompt = JSON.stringify(
    { instruction: input.prompt, layout: input.layout },
    null,
    2,
  );

  const result = await callGeminiJson({
    schema: GeminiEditResponseSchema,
    systemPrompt,
    userPrompt,
    fallback,
    timeoutMs: AI_EDIT_TIMEOUT_MS,
  });

  if ("usedFallback" in result && result.usedFallback) {
    return {
      layout: input.layout,
      diff: fallback.diff,
      status: "fallback",
      reason: "reason" in result ? result.reason : "fallback",
    };
  }

  // Force-preserve server-managed fields. Re-parse through schemas so
  // Zod defaults (e.g. needsFiller: false, diff arrays) are materialized
  // and the merged shape matches AssembledLayout exactly.
  const merged: AssembledLayout = AssembledLayoutSchema.parse({
    ...result.data.layout,
    templateId: input.layout.templateId,
    pageCount: input.layout.pageCount,
    version: input.layout.version, // bumped by caller
  });
  const diff: AiEditDiff = AiEditDiffSchema.parse(result.data.diff);

  return {
    layout: merged,
    diff,
    status: "applied",
  };
}
