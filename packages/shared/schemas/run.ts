import { z } from "zod";
import { ArticleTypeSchema } from "./layoutFit.js";
import { BlockStyleSchema, ListItemsSchema, VisualPersonalitySchema } from "./blockStyle.js";
import { AssetDecisionRecordSchema } from "./sourceContract.js";

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
  /** Uploaded photo filenames explicitly associated with this article. */
  imageRefs: z.array(z.string()).default([]).optional(),
  /**
   * TRI-R04 — operator-confirmed alias records: "reference → target image ID".
   * Stored as real link records (not ref→ID substitution in imageRefs), so
   * the original ref text is preserved for audit and resolution is
   * deterministic across preflight, planner and saved run.
   */
  operatorAliases: z.record(z.string()).optional(),
  /** True if this body was AI-generated as filler. */
  isFiller: z.boolean().default(false),
  source: z.enum(["MOCK", "UPLOAD", "GENERATED"]).default("MOCK"),
  /** Porter source-role semantics. Optional for legacy runs. */
  sourceRole: z.enum(["director-note", "birthday-roster", "dated-list", "profile-story", "narrative-story", "brief"]).optional(),
  sourceOrder: z.number().int().nonnegative().optional(),
  compoundId: z.string().optional(),
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
/** Normalized subject box in percent of the image (0..100). TRI-R05. */
export const SubjectBoundsSchema = z.object({
  left: z.number().min(0).max(100),
  top: z.number().min(0).max(100),
  right: z.number().min(0).max(100),
  bottom: z.number().min(0).max(100),
});
export type SubjectBounds = z.infer<typeof SubjectBoundsSchema>;

/**
 * TRI-R05 — visible-content analysis of actual image pixels.
 * Never stores personal identities or medical inferences.
 */
export const ImageContentAnalysisSchema = z.object({
  /** Short scene description of what is visibly present. */
  scene: z.string(),
  /** Visible objects / activities (no person names). */
  objects: z.array(z.string()).default([]),
  /** Image orientation from pixels. */
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  /** Inclusive subject-safe bounds covering people and primary content. */
  subjectBounds: SubjectBoundsSchema.optional(),
  /** Count of visible people only — never identities. */
  peopleCount: z.number().int().min(0).optional(),
  /** Provider that produced this analysis (gemini, openai, fixture, unavailable). */
  provider: z.string(),
  model: z.string(),
  /** Prompt/schema version used for cache keys. */
  promptVersion: z.string(),
  /** SHA-256 of image bytes used for cache lookup. */
  contentHash: z.string().optional(),
  cached: z.boolean().optional(),
});
export type ImageContentAnalysis = z.infer<typeof ImageContentAnalysisSchema>;

/** Crop alternative offered when layout/frame choice must stay subject-safe. */
export const CropAlternativeSchema = z.object({
  label: z.string(),
  fitMode: z.enum(["cover", "contain", "fill"]),
  focalX: z.number().min(0).max(100),
  focalY: z.number().min(0).max(100),
  zoom: z.number().min(1).max(3),
  /** True when this option would clip subject bounds under cover. */
  clipsSubject: z.boolean().default(false),
  reason: z.string(),
});
export type CropAlternative = z.infer<typeof CropAlternativeSchema>;

export const ImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  caption: z.string().optional(),
  alt: z.string().optional(),
  /** Natural-language description used for semantic matching and prompt context. */
  description: z.string().optional(),
  /** Controlled-ish tags for deterministic stock/photo matching. */
  tags: z.array(z.string()).default([]).optional(),
  aspect: z.enum(["square", "portrait", "landscape"]).default("landscape"),
  /** Editor image crop/focal-point controls. Percent values, 0..100. */
  focalX: z.number().min(0).max(100).default(50).optional(),
  focalY: z.number().min(0).max(100).default(50).optional(),
  /** Editor zoom for cover-fit images. 1 = normal. */
  zoom: z.number().min(1).max(3).default(1).optional(),
  /** How the image should fit its assigned frame. */
  fitMode: z.enum(["cover", "contain", "fill"]).default("cover").optional(),
  /** True if this image is a placeholder rather than real content. */
  isPlaceholder: z.boolean().default(false),
  source: z.enum(["MOCK", "UPLOAD", "GENERATED", "STOCK"]).default("MOCK"),
  /** Original uploaded filename, retained for deterministic source matching. */
  originalName: z.string().optional(),
  /** EXIF orientation after metadata inspection, if present. */
  exifOrientation: z.number().int().min(1).max(8).optional(),
  /** Whether the image was physically oriented before rendering. */
  orientationApplied: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /**
   * TRI-R05 — pixel-derived content analysis. When absent and analysisStatus
   * is "unavailable", assignment must stay unassigned (no metadata scorer).
   */
  contentAnalysis: ImageContentAnalysisSchema.optional(),
  /** How description evidence was obtained. */
  analysisStatus: z.enum(["vision", "fixture", "unavailable", "skipped"]).optional(),
  /** Subject-safe crop alternatives for the current / last frame choice. */
  cropAlternatives: z.array(CropAlternativeSchema).optional(),
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
    /** v3 — structured label/value list (birthdays, event schedules). */
    "list",
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
  /** v3 — visual styling (panel color, header color, etc.). */
  style: BlockStyleSchema.optional(),
  /** v3 — display heading for the block (colored ALL-CAPS section header). */
  heading: z.string().optional(),
  /** v3 — caption rendered under image blocks (italic, centered). */
  caption: z.string().optional(),
  /** v3 — rows for kind:"list" blocks (birthdays, schedules). */
  listItems: ListItemsSchema.optional(),
  /** Porter compound semantics. Optional for legacy runs and non-Porter layouts. */
  sourceRole: z.enum(["director-note", "birthday-roster", "dated-list", "profile-story", "narrative-story", "brief"]).optional(),
  sourceOrder: z.number().int().nonnegative().optional(),
  compoundId: z.string().optional(),
});
export type LayoutBlock = z.infer<typeof LayoutBlockSchema>;

export const LayoutModeSchema = z.enum(["full-issue", "campus-inner-spread"]);
export type LayoutMode = z.infer<typeof LayoutModeSchema>;

export const AssembledLayoutSchema = z.object({
  templateId: z.string(),
  /** Explicit source scope; inner layouts use local pages 1–2. */
  layoutMode: LayoutModeSchema.optional(),
  /** Offset from layout-local page numbers to newsletter logical pages. */
  logicalPageOffset: z.number().int().min(0).optional(),
  pageCount: z.number().int().min(1),
  visualPersonality: VisualPersonalitySchema.optional(),
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
  /**
   * Per-asset placement decisions (placed/rejected with recorded reasons).
   * TRI-R04 item 4: rejected assets must carry a stored reason so layout
   * decisions are traceable to the shared source/asset contract.
   */
  assetDecisions: z.array(AssetDecisionRecordSchema).optional(),
  /** Bumped by edits. */
  version: z.number().int().min(1).default(1),
});
export type AssembledLayout = z.infer<typeof AssembledLayoutSchema>;
