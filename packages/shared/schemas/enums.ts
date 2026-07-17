import { z } from "zod";

export const RichnessSchema = z.enum([
  "SIMPLE",
  "MODERATE",
  "RICH",
  "EXTRA_RICH",
]);
export type Richness = z.infer<typeof RichnessSchema>;

export const CareLevelSchema = z.enum([
  "INDEPENDENT_LIVING",
  "ASSISTED_LIVING",
  "MEMORY_CARE",
  "MIXED",
]);
export type CareLevel = z.infer<typeof CareLevelSchema>;

export const FillerModeSchema = z.enum(["GENERATE", "PLACEHOLDER"]);
export type FillerMode = z.infer<typeof FillerModeSchema>;

export const RunStatusSchema = z.enum([
  "DRAFT",
  "ASSEMBLING",
  "READY",
  "ERROR",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const AssetTypeSchema = z.enum(["IMAGE", "ARTICLE"]);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const AssetSourceSchema = z.enum(["MOCK", "UPLOAD", "GENERATED"]);
export type AssetSource = z.infer<typeof AssetSourceSchema>;
