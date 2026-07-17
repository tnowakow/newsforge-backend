import { z } from "zod";

/**
 * A single compliance flag surfaced during ingestion / mutation.
 * Never blocks render or approval (v2 rule 13).
 */
export const ComplianceCategorySchema = z.enum([
  "resident-last-name",
  "full-birthdate-with-name",
  "likely-stock-photo",
  "last-name-in-image",
]);
export type ComplianceCategory = z.infer<typeof ComplianceCategorySchema>;

export const ComplianceSeveritySchema = z.enum(["block", "warn", "info"]);
export type ComplianceSeverity = z.infer<typeof ComplianceSeveritySchema>;

export const ComplianceTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("article"),
    articleId: z.string(),
    offset: z.number().int().optional(),
    match: z.string().optional(),
  }),
  z.object({
    kind: z.literal("image"),
    imageId: z.string(),
    bbox: z.array(z.number()).length(4).optional(),
  }),
]);
export type ComplianceTarget = z.infer<typeof ComplianceTargetSchema>;

export const ComplianceFlagSchema = z.object({
  id: z.string(),
  category: ComplianceCategorySchema,
  severity: ComplianceSeveritySchema,
  target: ComplianceTargetSchema,
  reason: z.string(),
  detectorVersion: z.string(),
  resolvedByUser: z.boolean().default(false),
});
export type ComplianceFlag = z.infer<typeof ComplianceFlagSchema>;

export const ComplianceFlagsSchema = z.array(ComplianceFlagSchema);
export type ComplianceFlags = z.infer<typeof ComplianceFlagsSchema>;
