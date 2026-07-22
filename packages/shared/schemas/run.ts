import { z } from "zod";
import { ArticleTypeSchema } from "./layoutFit.js";

/**
 * One article in a newsletter run.
 */
export const ArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  wordCount: z.number().int().nonnegative(),
  /** Author or contributor name (optional). */
  byline: z.string().optional(),
  /** Which recurring section this article belongs to, if any. */
  sectionId: z.string().optional(),
  /** True if this body was AI-generated as filler. */
  isFiller: z.boolean().default(false),
  source: z.enum(["MOCK", "UPLOAD", "GENERATED"]).default("MOCK"),
  /**
   * v2 addition — Gemini-classified article kind, optional to keep legacy
   * runs parseable.
   */
  articleType: ArticleTypeSchema.optional(),
});
export type Article = z.infer<typeof ArticleSchema>;
export const ArticlesSchema = z.array(ArticleSchema);

/**
 * One image asset attached to a run.
 */
export const ImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  caption: z.string().optional(),
  alt: z.string().optional(),
  aspect: z.enum(["square", "portrait", "landscape"]).default("landscape"),
  /** Editor image crop/focal-point controls. Percent values, 0..100. */
  focalX: z.number().min(0).max(100).default(50).optional(),
  focalY: z.number().min(0).max(100).default(50).optional(),
  /** Editor zoom for cover-fit images. 1 = normal. */
  zoom: z.number().min(1).max(3).default(1).optional(),
  /** True if this image is a placeholder rather than real content. */
  isPlaceholder: z.boolean().default(false),
  source: z.enum(["MOCK", "UPLOAD", "GENERATED"]).default("MOCK"),
});
export type NewsImage = z.infer<typeof ImageSchema>;
export const ImagesSchema = z.array(ImageSchema);

/**
 * A placed block in the assembled layout. References either an article
 * or an image (or a filler / placeholder block).
 */
export const LayoutBlockSchema = z.object({
  blockId: z.string(),
  slotId: z.string(),
  page: z.number().int().min(1),
  position: z.object({
    col: z.number().int(),
    row: z.number().int(),
    colSpan: z.number().int(),
    rowSpan: z.number().int(),
  }),
  kind: z.enum([
    "article",
    "image",
    "filler",
    "placeholder",
    "recurring",
    "empty",
  ]),
  articleId: z.string().optional(),
  imageId: z.string().optional(),
  /** Inline body for filler blocks the fitter produced. */
  inlineText: z.string().optional(),
  /** Section reference (recurring section id). */
  sectionId: z.string().optional(),
  needsFiller: z.boolean().default(false),
  styleTag: z.string().optional(),
  /** Editor layer ordering for overlapping blocks. */
  zIndex: z.number().int().default(0).optional(),
});
export type LayoutBlock = z.infer<typeof LayoutBlockSchema>;

export const AssembledLayoutSchema = z.object({
  templateId: z.string(),
  pageCount: z.number().int().min(1),
  blocks: z.array(LayoutBlockSchema),
  /** Slot ids that the fitter could not fill from supplied content. */
  unfilledSlotIds: z.array(z.string()).default([]),
  /** Summary stats. */
  stats: z.object({
    placedArticles: z.number().int().nonnegative(),
    placedImages: z.number().int().nonnegative(),
    fillerBlocks: z.number().int().nonnegative(),
    emptySlots: z.number().int().nonnegative(),
  }),
  /** Bumped by edits. */
  version: z.number().int().min(1).default(1),
});
export type AssembledLayout = z.infer<typeof AssembledLayoutSchema>;
