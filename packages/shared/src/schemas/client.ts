import { z } from "zod";
import { RichnessEnum, CareLevelEnum } from "./common.js";

export const RecurringSectionsSchema = z.array(z.string().min(1));
export type RecurringSections = z.infer<typeof RecurringSectionsSchema>;

/** Public client summary used by the picker (Screen 1). */
export const ClientSummaryDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  city: z.string(),
  careLevel: CareLevelEnum,
  richnessLevel: RichnessEnum,
  logoUrl: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  pageCount: z.number().int().positive(),
});
export type ClientSummaryDto = z.infer<typeof ClientSummaryDtoSchema>;

/** Full brand kit for the workspace (Screen 2). */
export const ClientFullDtoSchema = ClientSummaryDtoSchema.extend({
  headingFont: z.string(),
  bodyFont: z.string(),
  defaultTemplateId: z.string(),
  recurringSections: RecurringSectionsSchema,
  brandVoice: z.string(),
});
export type ClientFullDto = z.infer<typeof ClientFullDtoSchema>;
