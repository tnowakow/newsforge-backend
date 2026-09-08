import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { digestFinalArtifact, evaluateFinalArtifactGate } from "../services/finalArtifactGate.js";

const measurement = {
  clippedBlocks: 0,
  overflowBlocks: 0,
  missingImages: 0,
  largestEmptyBandRatio: 0.04,
  pageMetrics: [{ page: 1, blockCount: 2, contentBlockCount: 2, imageBlocks: 1, clippedBlocks: 0, overflowBlocks: 0, missingImages: 0, renderFit: 1, usefulOccupancy: 0.8 }],
};

function passingInput() {
  const contentDigest = digestFinalArtifact({ content: "final" });
  const renderContractDigest = digestFinalArtifact({ contract: "v1" });
  return {
    sourceComplete: true,
    requiredLinksResolved: true,
    actualPageCount: 2,
    expectedPageCount: 2,
    measurementStatus: "passed" as const,
    measurement,
    minBodyFontPt: 10.5,
    minCaptionFontPt: 9,
    requiredBodyFontPt: 10.5,
    requiredCaptionFontPt: 9,
    contentDigest,
    renderContractDigest,
    reportDigest: digestFinalArtifact({ contentDigest, renderContractDigest }),
  };
}

describe("evaluateFinalArtifactGate", () => {
  it("passes only a fully bound final artifact", () => {
    assert.equal(evaluateFinalArtifactGate(passingInput()).passed, true);
  });

  it("fails unknown measurements and missing reports closed", () => {
    const input = passingInput();
    assert.deepEqual(evaluateFinalArtifactGate({ ...input, measurementStatus: "unknown", measurement: undefined }).passed, false);
    assert.ok(evaluateFinalArtifactGate({ ...input, measurementStatus: "passed", measurement: undefined }).failures.includes("final-measurement-missing"));
    assert.ok(evaluateFinalArtifactGate({ ...input, reportDigest: "stale" }).failures.includes("stale-or-unbound-report"));
  });

  it("checks every page and rejects sparse/unsafe output", () => {
    const input = passingInput();
    const bad = evaluateFinalArtifactGate({
      ...input,
      actualPageCount: 1,
      measurement: { ...measurement, largestEmptyBandRatio: 0.09, pageMetrics: [{ ...measurement.pageMetrics[0], page: 2, clippedBlocks: 1 }] },
    });
    assert.equal(bad.passed, false);
    assert.ok(bad.failures.includes("page-count-mismatch"));
    assert.ok(bad.failures.includes("largest-unused-region"));
    assert.ok(bad.failures.includes("page-2-clipping"));
  });
});
