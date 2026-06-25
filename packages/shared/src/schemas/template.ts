import { z } from "zod";
import { RichnessEnum } from "./common.js";
import { BlockTypeEnum } from "./layout.js";

export const GridSpecSchema = z.object({
  columns: z.number().int().positive(),
  rowsPerPage: z.number().int().positive(),
  gutter: z.number().nonnegative(),
  margin: z.number().nonnegative(),
});
export type GridSpec = z.infer<typeof GridSpecSchema>;

export const TemplateSlotSchema = z.object({
  id: z.string().min(1),
  page: z.number().int().positive(),
  type: BlockTypeEnum,
  wMin: z.number().int().positive(),
  wMax: z.number().int().positive(),
  hMin: z.number().int().positive(),
  hMax: z.number().int().positive(),
  /** Anchor on the grid (default placement). */
  x: z.number().int().nonnegative().optional(),
  y: z.number().int().nonnegative().optional(),
});
export type TemplateSlot = z.infer<typeof TemplateSlotSchema>;

export const TemplateSlotsSchema = z.array(TemplateSlotSchema);

export const CompatibilityHintsSchema = z.object({
  richnessRange: z.array(RichnessEnum).min(1),
  minArticles: z.number().int().nonnegative(),
  minImages: z.number().int().nonnegative(),
});
export type CompatibilityHints = z.infer<typeof CompatibilityHintsSchema>;

export const TemplateDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  pageCount: z.number().int().positive(),
  gridSpec: GridSpecSchema,
  slotTypes: TemplateSlotsSchema,
  compatibilityHints: CompatibilityHintsSchema,
  previewImageUrl: z.string().nullable(),
});
export type TemplateDto = z.infer<typeof TemplateDtoSchema>;
