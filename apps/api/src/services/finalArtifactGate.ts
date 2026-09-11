import crypto from "node:crypto";
import type { CandidateMeasurement } from "./adaptiveLayoutPlanner.js";

export type FinalMeasurementStatus = "passed" | "failed" | "unknown";

export interface FinalArtifactGateInput {
  sourceComplete: boolean;
  requiredLinksResolved: boolean;
  actualPageCount: number;
  expectedPageCount: number;
  measurementStatus: FinalMeasurementStatus;
  measurement?: Pick<CandidateMeasurement,
    | "clippedBlocks"
    | "overflowBlocks"
    | "missingImages"
    | "missingFonts"
    | "sourceTextMissing"
    | "pageMetrics"
    | "largestEmptyBandRatio"
  >;
  minBodyFontPt?: number;
  minCaptionFontPt?: number;
  requiredBodyFontPt?: number;
  requiredCaptionFontPt?: number;
  missingEmbeddedFonts?: string[];
  contentDigest?: string;
  renderContractDigest?: string;
  artifactDigest?: string;
  exportVariant?: string;
  layoutVersion?: number;
  reportDigest?: string;
  duplicateIssues?: string[];
}

export interface FinalArtifactGateReport {
  passed: boolean;
  failures: string[];
  warnings: string[];
  measurementStatus: FinalMeasurementStatus;
  actualPageCount: number;
  expectedPageCount: number;
  contentDigest?: string;
  renderContractDigest?: string;
  artifactDigest?: string;
  exportVariant?: string;
  layoutVersion?: number;
}

export function digestFinalArtifact(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalize(item)]));
    }
    return input;
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export function finalArtifactReportDigest(input: Pick<FinalArtifactGateInput,
  "contentDigest" | "renderContractDigest" | "artifactDigest" | "exportVariant" | "layoutVersion"
>): string {
  return digestFinalArtifact({
    contentDigest: input.contentDigest,
    renderContractDigest: input.renderContractDigest,
    artifactDigest: input.artifactDigest,
    exportVariant: input.exportVariant,
    layoutVersion: input.layoutVersion,
  });
}

export function evaluateFinalArtifactGate(input: FinalArtifactGateInput): FinalArtifactGateReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  if (!input.sourceComplete) failures.push("source-incomplete");
  if (!input.requiredLinksResolved) failures.push("required-links-unresolved");
  if (!Number.isInteger(input.actualPageCount) || input.actualPageCount <= 0) failures.push("actual-page-count-unknown");
  else if (input.actualPageCount !== input.expectedPageCount) failures.push("page-count-mismatch");
  if (input.measurementStatus !== "passed") failures.push(`final-measurement-${input.measurementStatus}`);
  if (input.measurementStatus === "passed" && !input.measurement) failures.push("final-measurement-missing");
  if (input.measurement) {
    if (input.measurement.clippedBlocks > 0) failures.push("clipping");
    if (input.measurement.overflowBlocks > 0) failures.push("overlap-or-overflow");
    if (input.measurement.missingImages > 0) failures.push("missing-images");
    if ((input.measurement.missingFonts?.length ?? 0) > 0) failures.push("missing-render-fonts");
    for (const missing of input.measurement.sourceTextMissing ?? []) failures.push(`missing-visible-copy:${missing}`);
    for (const page of input.measurement.pageMetrics ?? []) {
      if (page.clippedBlocks > 0) failures.push(`page-${page.page}-clipping`);
      if (page.overflowBlocks > 0) failures.push(`page-${page.page}-overlap-or-overflow`);
      if (page.missingImages > 0) failures.push(`page-${page.page}-missing-images`);
    }
    if ((input.measurement.largestEmptyBandRatio ?? 0) > 0.08) {
      warnings.push("large-empty-region-review");
    }
  }
  for (const font of input.missingEmbeddedFonts ?? []) failures.push(`missing-embedded-font:${font}`);
  if (input.requiredBodyFontPt != null && (input.minBodyFontPt == null || input.minBodyFontPt < input.requiredBodyFontPt - 0.05)) failures.push("body-type-floor");
  if (input.requiredCaptionFontPt != null && (input.minCaptionFontPt == null || input.minCaptionFontPt < input.requiredCaptionFontPt - 0.05)) failures.push("caption-type-floor");
  if (!input.artifactDigest) failures.push("output-hash-missing");
  if (!input.exportVariant) failures.push("export-variant-missing");
  if (!Number.isInteger(input.layoutVersion) || (input.layoutVersion ?? 0) <= 0) failures.push("layout-version-missing");
  if (
    input.reportDigest == null ||
    input.contentDigest == null ||
    input.renderContractDigest == null ||
    input.reportDigest !== finalArtifactReportDigest(input)
  ) failures.push("stale-or-unbound-report");
  for (const issue of input.duplicateIssues ?? []) failures.push(`duplicate-content:${issue}`);
  return {
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    warnings,
    measurementStatus: input.measurementStatus,
    actualPageCount: input.actualPageCount,
    expectedPageCount: input.expectedPageCount,
    contentDigest: input.contentDigest,
    renderContractDigest: input.renderContractDigest,
    artifactDigest: input.artifactDigest,
    exportVariant: input.exportVariant,
    layoutVersion: input.layoutVersion,
  };
}
