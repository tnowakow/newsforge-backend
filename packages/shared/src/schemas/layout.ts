import { z } from "zod";

export const BlockTypeEnum = z.enum([
  "headline",
  "image",
  "body",
  "sidebar",
  "gallery",
  "masthead",
  "footer",
]);
export type BlockType = z.infer<typeof BlockTypeEnum>;

export const ContentRefSchema = z.object({
  kind: z.enum(["article", "image", "placeholder"]),
  id: z.string().optional(),
  /** Inline payload for placeholders / generated filler captions. */
  inline: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
});
export type ContentRef = z.infer<typeof ContentRefSchema>;

export const LayoutBlockSchema = z.object({
  id: z.string().min(1),
  type: BlockTypeEnum,
  /** Grid units — renderer maps to px. */
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  contentRef: ContentRefSchema,
});
export type LayoutBlock = z.infer<typeof LayoutBlockSchema>;

export const LayoutPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  template: z.object({
    gridCols: z.number().int().positive(),
    gridRows: z.number().int().positive(),
  }),
  blocks: z.array(LayoutBlockSchema),
});
export type LayoutPage = z.infer<typeof LayoutPageSchema>;

export const AssembledLayoutSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(LayoutPageSchema),
});
export type AssembledLayout = z.infer<typeof AssembledLayoutSchema>;
