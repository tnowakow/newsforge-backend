import { z } from "zod";

/**
 * BundleManifest — the layout.json inside an InDesign bundle .zip (v2 §10).
 */
export const BundleBlockKindSchema = z.enum([
  "article",
  "image",
  "filler",
  "placeholder",
  "recurring",
  "empty",
]);
export type BundleBlockKind = z.infer<typeof BundleBlockKindSchema>;

export const BundleBlockSchema = z.object({
  blockId: z.string(),
  slotId: z.string(),
  page: z.number().int(),
  kind: BundleBlockKindSchema,
  position: z.object({
    col: z.number().int(),
    row: z.number().int(),
    colSpan: z.number().int(),
    rowSpan: z.number().int(),
  }),
  textFile: z.string().optional(),
  imageFile: z.string().optional(),
  styleTag: z.string().optional(),
});
export type BundleBlock = z.infer<typeof BundleBlockSchema>;

export const BundleManifestSchema = z.object({
  runId: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  templateId: z.string(),
  templateName: z.string(),
  monthLabel: z.string(),
  layoutVersion: z.number().int(),
  generatedAt: z.string(),
  bleedInches: z.number(),
  safeAreaInches: z.number(),
  cropMarksEnabled: z.boolean(),
  pageCount: z.number().int(),
  blocks: z.array(BundleBlockSchema),
});
export type BundleManifest = z.infer<typeof BundleManifestSchema>;
