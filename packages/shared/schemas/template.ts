import { z } from "zod";

/**
 * A single slot in a template grid. The fitter places articles/images
 * into slots whose `type` matches and whose `capacity` fits the content.
 */
export const TemplateSlotSchema = z.object({
  id: z.string(),
  page: z.number().int().min(1),
  type: z.enum([
    "headline",
    "body",
    "image",
    "sidebar",
    "calendar",
    "spotlight",
    "filler",
    /** v3 — structured label/value list slot (birthdays, schedules). */
    "list",
  ]),
  /** Grid placement in 12-col system. */
  col: z.number().int().min(1).max(24),
  row: z.number().int().min(1),
  colSpan: z.number().int().min(1).max(24),
  rowSpan: z.number().int().min(1),
  /** Soft capacity hint — word count for text, aspect for images. */
  capacity: z.object({
    minWords: z.number().int().nonnegative().optional(),
    maxWords: z.number().int().nonnegative().optional(),
    aspect: z.enum(["square", "portrait", "landscape", "any"]).optional(),
  }).default({}),
  /** Tag for layout style ("hero", "callout", etc.). */
  styleTag: z.string().optional(),
});
export type TemplateSlot = z.infer<typeof TemplateSlotSchema>;

export const GridSpecSchema = z.object({
  /** Human label, e.g. "magazine-3col-photo-heavy". */
  label: z.string(),
  columns: z.number().int().min(1).max(24),
  rowsPerPage: z.number().int().min(1),
  slots: z.array(TemplateSlotSchema),
});
export type GridSpec = z.infer<typeof GridSpecSchema>;

/**
 * Map of slot-type -> count present in this template.
 * Used by the fitter as a quick "what does this template hold?" lookup.
 */
export const SlotTypesSchema = z.object({
  headline: z.number().int().nonnegative().default(0),
  body: z.number().int().nonnegative().default(0),
  image: z.number().int().nonnegative().default(0),
  sidebar: z.number().int().nonnegative().default(0),
  calendar: z.number().int().nonnegative().default(0),
  spotlight: z.number().int().nonnegative().default(0),
  filler: z.number().int().nonnegative().default(0),
  list: z.number().int().nonnegative().default(0).optional(),
});
export type SlotTypes = z.infer<typeof SlotTypesSchema>;

export const CompatibilityHintsSchema = z.object({
  /** Best richness levels for this template. */
  richness: z.array(
    z.enum(["SIMPLE", "MODERATE", "RICH", "EXTRA_RICH"]),
  ),
  /** Best care levels for this template. */
  careLevels: z.array(
    z.enum([
      "INDEPENDENT_LIVING",
      "ASSISTED_LIVING",
      "MEMORY_CARE",
      "MIXED",
    ]),
  ),
  /** Free text guidance for designers. */
  notes: z.string().optional(),
});
export type CompatibilityHints = z.infer<typeof CompatibilityHintsSchema>;
