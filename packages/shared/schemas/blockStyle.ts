import { z } from "zod";

/**
 * v3 — visual vocabulary for layout blocks.
 *
 * The v2 model could only express geometry (grid position + a freeform
 * styleTag). The reference newsletters NewsForge is meant to reproduce are
 * built from *styled panels*: a yellow birthday card, a navy happy-hour
 * schedule, an orange events rail, cream "Executive Director Corner",
 * captioned photos, and colored ALL-CAPS section headers. v3 makes those
 * first-class so the AI layout designer, the web editor, the print renderer,
 * and the IDML exporter all speak the same language.
 *
 * Colors are expressed as TOKENS, not hex values. Three tokens map to the
 * client brand kit (primary / secondary / accent); the rest are a fixed
 * complementary palette shared by every renderer (see PANEL_PALETTE in
 * apps/api/src/services/designLanguage.ts and apps/web/src/lib/v3.ts).
 * Keeping tokens in the document model means a brand-kit change restyles
 * every rendition without touching stored layouts.
 */

export const PanelTokenSchema = z.enum([
  "primary", // brand kit primaryColor
  "secondary", // brand kit secondaryColor
  "accent", // brand kit accentColor
  "sun", // warm yellow (birthday card)
  "navy", // deep navy (schedule panels)
  "coral", // warm orange (events / section headers)
  "sky", // light blue (anniversary / info panels)
  "berry", // muted purple (legacy / memory-care panels)
  "leaf", // green (campus / outdoors headers)
  "blush", // soft pink (spotlight panels)
  "cream", // warm off-white (executive director corner)
  "paper", // plain page background (no panel)
]);
export type PanelToken = z.infer<typeof PanelTokenSchema>;

export const BlockStyleSchema = z.object({
  /** Panel background token. "paper" (or absent) = no panel. */
  bg: PanelTokenSchema.optional(),
  /** Header / title color token for the block's heading text. */
  headerColor: PanelTokenSchema.optional(),
  /** Force light text (for dark panels like navy). */
  invertText: z.boolean().optional(),
  /** Rounded panel corners (pt-ish units; renderer maps to px/pt). */
  cornerRadius: z.number().min(0).max(24).optional(),
  /** Script/italic display heading treatment ("Happy Birthday!" style). */
  scriptHeading: z.boolean().optional(),
  /** Center-align block text (used for event rails, panel callouts). */
  centered: z.boolean().optional(),
});
export type BlockStyle = z.infer<typeof BlockStyleSchema>;

/** One row in a structured list block (birthdays, event schedules). */
export const ListItemSchema = z.object({
  /** Left column — a name or a date, e.g. "Mary Ann F." or "7/03". */
  label: z.string(),
  /** Right column — a date or an event name. Optional for single-column rows. */
  value: z.string().optional(),
  /** Optional group header row, e.g. "RESIDENTS" / "STAFF". */
  isGroupHeader: z.boolean().optional(),
});
export type ListItem = z.infer<typeof ListItemSchema>;
export const ListItemsSchema = z.array(ListItemSchema);
