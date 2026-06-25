import { z } from "zod";

export const ImageRefSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().optional(),
  source: z.enum(["mock", "upload", "generated"]),
});
export type ImageRef = z.infer<typeof ImageRefSchema>;

export const ImageRefArraySchema = z.array(ImageRefSchema);
