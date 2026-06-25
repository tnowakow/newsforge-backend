import { z } from "zod";

export const RichnessEnum = z.enum(["SIMPLE", "MODERATE", "RICH", "EXTRA_RICH"]);
export type Richness = z.infer<typeof RichnessEnum>;

export const CareLevelEnum = z.enum([
  "INDEPENDENT_LIVING",
  "ASSISTED_LIVING",
  "MEMORY_CARE",
  "MIXED",
]);
export type CareLevel = z.infer<typeof CareLevelEnum>;

export const FillerModeEnum = z.enum(["GENERATE", "PLACEHOLDER"]);
export type FillerMode = z.infer<typeof FillerModeEnum>;

export const RunStatusEnum = z.enum(["DRAFT", "ASSEMBLING", "READY", "ERROR"]);
export type RunStatus = z.infer<typeof RunStatusEnum>;

export const AssetTypeEnum = z.enum(["IMAGE", "ARTICLE"]);
export type AssetType = z.infer<typeof AssetTypeEnum>;

export const AssetSourceEnum = z.enum(["MOCK", "UPLOAD", "GENERATED"]);
export type AssetSource = z.infer<typeof AssetSourceEnum>;

/** Vitaly §6.1: every JSON column carries a schemaVersion for forward-safe reads. */
export const SCHEMA_VERSION = 1 as const;
