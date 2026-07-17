import { z } from "zod";

/**
 * Recurring section on every newsletter (e.g. "Director's Letter",
 * "Birthdays", "Activities Calendar"). Stored as JSON on Client.
 */
export const RecurringSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Slot category this section prefers to occupy in the template. */
  slotHint: z.enum(["headline", "body", "sidebar", "calendar", "spotlight"]),
  /** Approximate word target for filler/generation. */
  wordTarget: z.number().int().positive().default(180),
  /** Whether the section is required (true) or floats if space allows. */
  required: z.boolean().default(true),
  /** Description shown to AI when generating filler. */
  description: z.string().optional(),
});
export type RecurringSection = z.infer<typeof RecurringSectionSchema>;

export const RecurringSectionsSchema = z.array(RecurringSectionSchema);
export type RecurringSections = z.infer<typeof RecurringSectionsSchema>;

/**
 * Convenience schema describing a client's full brand kit
 * (mostly stored as flat columns, but useful as a typed bundle).
 */
export const BrandKitSchema = z.object({
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  headingFont: z.string(),
  bodyFont: z.string(),
  logoUrl: z.string().nullable(),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;
