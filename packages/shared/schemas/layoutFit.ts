import { z } from "zod";

/**
 * ArticleType — Gemini-classified article kind (v2 §4.A / §4.B).
 * Deterministic fallback maps to "other".
 * Lower-case wire values match the strings we surface in UI/JSON;
 * DB enum ArticleType uses upper-case (see Prisma schema.prisma).
 */
export const ArticleTypeSchema = z.enum([
  "resident-story",
  "event-recap",
  "announcement",
  "birthday",
  "executive-note",
  "other",
]);
export type ArticleType = z.infer<typeof ArticleTypeSchema>;

/**
 * Deterministic fit report emitted by layoutFitService.
 * Persisted on NewsletterRun.layoutFitReport (JSONB).
 */
export const LayoutFitCandidateSchema = z.object({
  templateId: z.string(),
  score: z.number(),
  subscores: z.object({
    articleCount: z.number(),
    photoCount: z.number(),
    articleTypeMatch: z.number(),
    avgWordDelta: z.number(),
  }),
});
export type LayoutFitCandidate = z.infer<typeof LayoutFitCandidateSchema>;

export const LayoutFitArticleFitSchema = z.object({
  articleId: z.string(),
  slotId: z.string(),
  wordsIn: z.number().int(),
  wordsOut: z.number().int(),
  trimmed: z.boolean(),
});
export type LayoutFitArticleFit = z.infer<typeof LayoutFitArticleFitSchema>;

export const LayoutFitPhotoFitSchema = z.object({
  imageId: z.string(),
  slotId: z.string().optional(),
  dropped: z.boolean().default(false),
  reason: z.enum(["fit", "photo-unused", "photos-under-supplied"]).optional(),
});
export type LayoutFitPhotoFit = z.infer<typeof LayoutFitPhotoFitSchema>;

export const LayoutFitReportSchema = z.object({
  chosenTemplateId: z.string(),
  score: z.number(),
  candidates: z.array(LayoutFitCandidateSchema),
  articleFit: z.array(LayoutFitArticleFitSchema),
  photoFit: z.array(LayoutFitPhotoFitSchema),
  emptySlots: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type LayoutFitReport = z.infer<typeof LayoutFitReportSchema>;
