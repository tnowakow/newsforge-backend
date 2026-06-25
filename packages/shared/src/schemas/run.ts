import { z } from "zod";
import { FillerModeEnum, RunStatusEnum } from "./common.js";
import { ArticleArraySchema } from "./article.js";
import { ImageRefArraySchema } from "./image.js";
import { AssembledLayoutSchema } from "./layout.js";

export const CreateRunRequestSchema = z.object({
  clientId: z.string().min(1),
  templateId: z.string().min(1).optional(),
  monthLabel: z.string().min(1),
  fillerMode: FillerModeEnum,
  /** Optional content seed (otherwise the server uses mock content already on file for this run/client). */
  articleIds: z.array(z.string()).optional(),
  imageIds: z.array(z.string()).optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export const NewsletterRunDtoSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  templateId: z.string(),
  monthLabel: z.string(),
  fillerMode: FillerModeEnum,
  status: RunStatusEnum,
  errorMessage: z.string().nullable(),
  pdfPath: z.string().nullable(),
  pdfGeneratedAt: z.string().nullable(),
  layoutVersion: z.number().int().positive(),
  articles: ArticleArraySchema,
  images: ImageRefArraySchema,
  assembledLayout: AssembledLayoutSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NewsletterRunDto = z.infer<typeof NewsletterRunDtoSchema>;

/** Manual edit (Screen 5) — apply a single block change. */
export const EditOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("move"),
    pageNumber: z.number().int().positive(),
    blockId: z.string().min(1),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal("resize"),
    pageNumber: z.number().int().positive(),
    blockId: z.string().min(1),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  z.object({
    op: z.literal("delete"),
    pageNumber: z.number().int().positive(),
    blockId: z.string().min(1),
  }),
  z.object({
    op: z.literal("swap-content"),
    pageNumber: z.number().int().positive(),
    blockId: z.string().min(1),
    contentRef: z.object({
      kind: z.enum(["article", "image", "placeholder"]),
      id: z.string().optional(),
    }),
  }),
]);
export type EditOp = z.infer<typeof EditOpSchema>;

export const EditRequestSchema = z.object({
  ops: z.array(EditOpSchema).min(1).max(50),
});
export type EditRequest = z.infer<typeof EditRequestSchema>;

export const FillerRequestSchema = z.object({
  /** Override default; usually inferred from the run. */
  mode: FillerModeEnum.optional(),
});
export type FillerRequest = z.infer<typeof FillerRequestSchema>;

export const MockContentRequestSchema = z.object({
  monthLabel: z.string().min(1),
  tone: z.enum(["warm", "formal", "playful", "civic"]).default("warm"),
  density: z.number().int().min(1).max(4).default(2),
  includeSections: z.array(z.string()).optional(),
});
export type MockContentRequest = z.infer<typeof MockContentRequestSchema>;
