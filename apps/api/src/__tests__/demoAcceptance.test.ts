import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { digestFinalArtifact, evaluateFinalArtifactGate } from "../services/finalArtifactGate.js";

const bound = () => {
  const contentDigest = digestFinalArtifact({ layout: "final", source: "complete" });
  const renderContractDigest = digestFinalArtifact({ id: "letter-inner-v1" });
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
    contentDigest,
    renderContractDigest,
    reportDigest: digestFinalArtifact({ contentDigest, renderContractDigest }),
  };
};

describe("demo acceptance fixtures fail closed", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["giant empty panel", { measurement: { ...bound().measurement, largestEmptyBandRatio: 0.2 } }],
    ["tiny text", { minBodyFontPt: 8 }],
    ["clipped heading", { measurement: { ...bound().measurement, clippedBlocks: 1 } }],
    ["missing image", { measurement: { ...bound().measurement, missingImages: 1 } }],
    ["measurement exception", { measurementStatus: "failed", measurement: undefined }],
    ["stale report", { reportDigest: "old-report" }],
    ["sparse page hidden by dense page", { measurement: { ...bound().measurement, pageMetrics: [{ page: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0 }, { page: 2, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, usefulOccupancy: 0.01 }] } }],
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
