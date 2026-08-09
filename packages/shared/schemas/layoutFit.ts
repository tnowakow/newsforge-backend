import { z } from "zod";
import { VisualPersonalitySchema } from "./blockStyle.js";

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

export const AdaptiveLayoutCandidateReportSchema = z.object({
  id: z.string(),
  label: z.string(),
  selected: z.boolean().optional(),
  geometryVariant: z.enum([
    "fixed",
    "lead-photo-swap",
    "photo-lead-swap",
    "brief-rail-swap",
    "text-photo-rebalance",
    "photo-band-expand",
    "grammar-feature-stack",
    "grammar-photo-mosaic",
  ]),
  score: z.number(),
  subscores: z.object({
    occupancy: z.number(),
    contentCoverage: z.number(),
    requiredCoverage: z.number(),
    balance: z.number(),
    clippingRisk: z.number(),
    geometryValidity: z.number(),
    photoImpact: z.number(),
    grammarAffinity: z.number(),
    usefulOccupancy: z.number().optional(),
    renderFit: z.number().optional(),
    geometricCoverage: z.number().optional(),
  }),
  warnings: z.array(z.string()),
  measurement: z.object({
    candidateId: z.string(),
    clippedBlocks: z.number().int().nonnegative(),
    clippedBlockIds: z.array(z.string()).optional(),
    overflowBlocks: z.number().int().nonnegative(),
    missingImages: z.number().int().nonnegative(),
    renderedImages: z.number().int().nonnegative(),
    totalImages: z.number().int().nonnegative(),
    usefulOccupancy: z.number(),
    geometricCoverage: z.number().optional(),
    minPageUtility: z.number().optional(),
    largestEmptyBandRatio: z.number().optional(),
    lowUtilityBlocks: z.number().int().nonnegative(),
  }).optional(),
});
export type AdaptiveLayoutCandidateReport = z.infer<
  typeof AdaptiveLayoutCandidateReportSchema
>;

export const EditorialPlanReportSchema = z.object({
  leadArticleId: z.string().optional(),
  photoGoal: z.enum(["text-led", "balanced", "photo-led"]),
  density: z.enum(["sparse", "moderate", "dense"]),
  visualPersonality: VisualPersonalitySchema,
  compositionGrammar: z.enum([
    "lead-story-collage",
    "events-and-milestones",
    "director-note-feature",
    "photo-recap-spread",
    "mixed-briefs",
  ]),
  requiredArticleIds: z.array(z.string()),
  items: z.array(z.object({
    articleId: z.string(),
    role: z.enum([
      "lead",
      "executive-note",
      "event",
      "service",
      "recurring",
      "supporting",
    ]),
    priority: z.number(),
    required: z.boolean(),
    preferredProminence: z.enum(["hero", "feature", "standard", "brief"]),
    trimMode: z.enum(["preserve", "sentence", "brief"]),
  })),
});
export type EditorialPlanReport = z.infer<typeof EditorialPlanReportSchema>;

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
  /** v3 — whether the layout was Gemini-designed or styled by fallback. */
  designMode: z.enum(["ai", "deterministic"]).optional(),
  designNotes: z.string().optional(),
  fallbackReason: z.string().optional(),
  renderFit: z.number().optional(),
  usefulOccupancy: z.number().optional(),
  geometricCoverage: z.number().optional(),
  minPageUtility: z.number().optional(),
  largestEmptyBandRatio: z.number().optional(),
  clippedBlocks: z.number().int().nonnegative().optional(),
  overflowBlocks: z.number().int().nonnegative().optional(),
  missingImages: z.number().int().nonnegative().optional(),
  renderedImages: z.number().int().nonnegative().optional(),
  editorialPlan: EditorialPlanReportSchema.optional(),
  adaptiveCandidates: z.array(AdaptiveLayoutCandidateReportSchema).optional(),
  candidates: z.array(LayoutFitCandidateSchema),
  articleFit: z.array(LayoutFitArticleFitSchema),
  photoFit: z.array(LayoutFitPhotoFitSchema),
  emptySlots: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type LayoutFitReport = z.infer<typeof LayoutFitReportSchema>;
