import { z } from "zod";
import { AssembledLayoutSchema } from "./run.js";

export const AiEditDiffSchema = z.object({
  /** Block ids that were added by the AI edit. */
  added: z.array(z.string()).default([]),
  /** Block ids that were removed. */
  removed: z.array(z.string()).default([]),
  /** Block ids that were modified. */
  modified: z.array(z.string()).default([]),
  /** Human-readable summary the AI returned. */
  summary: z.string().optional(),
});
export type AiEditDiff = z.infer<typeof AiEditDiffSchema>;

/**
 * Strict response contract from Gemini for AI edits.
 * Always validated; on failure we fall back to the previous layout.
 */
export const GeminiEditResponseSchema = z.object({
  layout: AssembledLayoutSchema,
  diff: AiEditDiffSchema,
});
export type GeminiEditResponse = z.infer<typeof GeminiEditResponseSchema>;

export const GeminiFillerArticleSchema = z.object({
  slotId: z.string(),
  title: z.string(),
  body: z.string(),
  wordCount: z.number().int().nonnegative(),
});
export type GeminiFillerArticle = z.infer<typeof GeminiFillerArticleSchema>;

export const GeminiFillerResponseSchema = z.object({
  articles: z.array(GeminiFillerArticleSchema),
});
export type GeminiFillerResponse = z.infer<typeof GeminiFillerResponseSchema>;

export const GeminiMockArticleSchema = z.object({
  title: z.string(),
  body: z.string(),
  wordCount: z.number().int().nonnegative(),
});
export type GeminiMockArticle = z.infer<typeof GeminiMockArticleSchema>;

export const GeminiMockResponseSchema = z.object({
  article: GeminiMockArticleSchema,
});
export type GeminiMockResponse = z.infer<typeof GeminiMockResponseSchema>;
