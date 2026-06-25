import { z } from "zod";

export const AiEditRequestSchema = z.object({
  prompt: z.string().min(4).max(2000),
});
export type AiEditRequest = z.infer<typeof AiEditRequestSchema>;

/** Structured Gemini response — bounded set of layout operations. */
export const AiLayoutOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    pageNumber: z.number().int().positive(),
    blockId: z.string(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal("resize"),
    pageNumber: z.number().int().positive(),
    blockId: z.string(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  z.object({
    op: z.literal("swap-blocks"),
    pageNumber: z.number().int().positive(),
    blockIdA: z.string(),
    blockIdB: z.string(),
  }),
  z.object({
    op: z.literal("replace-text"),
    pageNumber: z.number().int().positive(),
    blockId: z.string(),
    title: z.string().optional(),
    body: z.string().optional(),
    caption: z.string().optional(),
  }),
]);
export type AiLayoutOp = z.infer<typeof AiLayoutOpSchema>;

export const AiEditResponseSchema = z.object({
  summary: z.string().min(1).max(280),
  ops: z.array(AiLayoutOpSchema).max(30),
});
export type AiEditResponse = z.infer<typeof AiEditResponseSchema>;

export const AiUnlockRequestSchema = z.object({
  password: z.string().min(1).max(128),
});
export type AiUnlockRequest = z.infer<typeof AiUnlockRequestSchema>;
