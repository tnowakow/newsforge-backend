import crypto from "node:crypto";
import type { CandidateMeasurement } from "./adaptiveLayoutPlanner.js";

export type FinalMeasurementStatus = "passed" | "failed" | "unknown";

export interface FinalArtifactGateInput {
  sourceComplete: boolean;
  requiredLinksResolved: boolean;
  actualPageCount: number;
  expectedPageCount: number;
  measurementStatus: FinalMeasurementStatus;
  measurement?: Pick<CandidateMeasurement, "clippedBlocks" | "overflowBlocks" | "missingImages" | "pageMetrics" | "largestEmptyBandRatio">;
  minBodyFontPt?: number;
  minCaptionFontPt?: number;
  requiredBodyFontPt?: number;
  requiredCaptionFontPt?: number;
  contentDigest?: string;
  renderContractDigest?: string;
  reportDigest?: string;
  duplicateIssues?: string[];
}

export interface FinalArtifactGateReport {
  passed: boolean;
  failures: string[];
  measurementStatus: FinalMeasurementStatus;
  actualPageCount: number;
  expectedPageCount: number;
  contentDigest?: string;
  renderContractDigest?: string;
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

export function evaluateFinalArtifactGate(input: FinalArtifactGateInput): FinalArtifactGateReport {
  const failures: string[] = [];
  if (!input.sourceComplete) failures.push("source-incomplete");
  if (!input.requiredLinksResolved) failures.push("required-links-unresolved");
  if (input.actualPageCount !== input.expectedPageCount) failures.push("page-count-mismatch");
  if (input.measurementStatus !== "passed") failures.push(`final-measurement-${input.measurementStatus}`);
  if (input.measurementStatus === "passed" && !input.measurement) failures.push("final-measurement-missing");
  if (input.measurement) {
    if (input.measurement.clippedBlocks > 0) failures.push("clipping");
    if (input.measurement.overflowBlocks > 0) failures.push("overlap-or-overflow");
    if (input.measurement.missingImages > 0) failures.push("missing-images");
    if ((input.measurement.largestEmptyBandRatio ?? 0) > 0.08) failures.push("largest-unused-region");
    for (const page of input.measurement.pageMetrics ?? []) {
      if (page.clippedBlocks > 0) failures.push(`page-${page.page}-clipping`);
      if (page.overflowBlocks > 0) failures.push(`page-${page.page}-overlap-or-overflow`);
      if (page.missingImages > 0) failures.push(`page-${page.page}-missing-images`);
      if (page.usefulOccupancy < 0.35) failures.push(`page-${page.page}-underfilled`);
    }
  }
  if (input.requiredBodyFontPt != null && (input.minBodyFontPt == null || input.minBodyFontPt < input.requiredBodyFontPt)) failures.push("body-type-floor");
  if (input.requiredCaptionFontPt != null && (input.minCaptionFontPt == null || input.minCaptionFontPt < input.requiredCaptionFontPt)) failures.push("caption-type-floor");
  if (input.reportDigest == null || input.contentDigest == null || input.renderContractDigest == null || input.reportDigest !== digestFinalArtifact({ contentDigest: input.contentDigest, renderContractDigest: input.renderContractDigest })) {
    failures.push("stale-or-unbound-report");
  }
  for (const issue of input.duplicateIssues ?? []) failures.push(`duplicate-content:${issue}`);
  return {
    passed: failures.length === 0,
    failures,
    measurementStatus: input.measurementStatus,
    actualPageCount: input.actualPageCount,
    expectedPageCount: input.expectedPageCount,
    contentDigest: input.contentDigest,
    renderContractDigest: input.renderContractDigest,
  };
}
