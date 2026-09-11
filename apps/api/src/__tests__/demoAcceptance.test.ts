import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  digestFinalArtifact,
  evaluateFinalArtifactGate,
  finalArtifactReportDigest,
} from "../services/finalArtifactGate.js";

const bound = () => {
  const contentDigest = digestFinalArtifact({ layout: "final", source: "complete" });
  const renderContractDigest = digestFinalArtifact({ id: "letter-inner-v1" });
  const binding = {
    contentDigest,
    renderContractDigest,
    artifactDigest: digestFinalArtifact({ pdf: "final" }),
    exportVariant: "web",
    layoutVersion: 4,
  };
  return {
    sourceComplete: true,
    requiredLinksResolved: true,
    actualPageCount: 2,
    expectedPageCount: 2,
    measurementStatus: "passed" as const,
    measurement: { clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, largestEmptyBandRatio: 0.02 },
    minBodyFontPt: 10.5,
    minCaptionFontPt: 9,
    requiredBodyFontPt: 10.5,
    requiredCaptionFontPt: 9,
    ...binding,
    reportDigest: finalArtifactReportDigest(binding),
  };
};

describe("demo acceptance fixtures fail closed", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["tiny text", { minBodyFontPt: 8 }],
    ["clipped heading or ancestor", { measurement: { ...bound().measurement, clippedBlocks: 1 } }],
    ["partially clipped Chef line", { measurement: { ...bound().measurement, sourceTextMissing: ["chef:ending"] } }],
    ["missing image", { measurement: { ...bound().measurement, missingImages: 1 } }],
    ["missing embedded font", { missingEmbeddedFonts: ["Source Sans 3"] }],
    ["measurement exception", { measurementStatus: "failed", measurement: undefined }],
    ["stale report after crop edit", { contentDigest: "changed-crop" }],
    ["wrong PDF page count", { actualPageCount: 1 }],
    ["missing output hash", { artifactDigest: undefined }],
    ["dropped source paragraph", { sourceComplete: false }],
    ["missing second photo", { requiredLinksResolved: false }],
  ];
  for (const [name, change] of cases) {
    it(`blocks ${name}`, () => {
      const report = evaluateFinalArtifactGate({ ...bound(), ...change } as Parameters<typeof evaluateFinalArtifactGate>[0]);
      assert.equal(report.passed, false);
    });
  }
});
