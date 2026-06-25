import { z } from "zod";

export const ArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  wordCount: z.number().int().nonnegative(),
  tone: z.string().optional(),
  section: z.string().optional(),
});
export type Article = z.infer<typeof ArticleSchema>;

export const ArticleArraySchema = z.array(ArticleSchema);
