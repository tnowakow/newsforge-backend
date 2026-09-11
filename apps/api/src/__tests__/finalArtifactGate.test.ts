import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  digestFinalArtifact,
  evaluateFinalArtifactGate,
  finalArtifactReportDigest,
} from "../services/finalArtifactGate.js";

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
  const binding = {
    contentDigest,
    renderContractDigest,
    artifactDigest: digestFinalArtifact({ pdf: "bytes" }),
    exportVariant: "web",
    layoutVersion: 7,
  };
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
    ...binding,
    reportDigest: finalArtifactReportDigest(binding),
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

  it("checks every page while keeping whitespace a design warning", () => {
    const input = passingInput();
    const bad = evaluateFinalArtifactGate({
      ...input,
      actualPageCount: 1,
      measurement: { ...measurement, largestEmptyBandRatio: 0.09, pageMetrics: [{ ...measurement.pageMetrics[0], page: 2, clippedBlocks: 1 }] },
    });
    assert.equal(bad.passed, false);
    assert.ok(bad.failures.includes("page-count-mismatch"));
    assert.ok(bad.failures.includes("page-2-clipping"));
    assert.ok(bad.warnings.includes("large-empty-region-review"));

    const airy = evaluateFinalArtifactGate({
      ...input,
      measurement: { ...measurement, largestEmptyBandRatio: 0.2 },
    });
    assert.equal(airy.passed, true);
    assert.deepEqual(airy.warnings, ["large-empty-region-review"]);
  });

  it("binds the report to revision, variant, and exact PDF hash", () => {
    const input = passingInput();
    assert.equal(evaluateFinalArtifactGate({ ...input, artifactDigest: undefined }).passed, false);
    assert.equal(evaluateFinalArtifactGate({ ...input, exportVariant: "print" }).passed, false);
    assert.equal(evaluateFinalArtifactGate({ ...input, layoutVersion: 8 }).passed, false);
  });

  it("rejects missing embedded fonts and source copy even when upstream JSON exists", () => {
    const input = passingInput();
    const bad = evaluateFinalArtifactGate({
      ...input,
      missingEmbeddedFonts: ["EB Garamond"],
      measurement: { ...measurement, sourceTextMissing: ["director:body", "chef:ending"] },
    });
    assert.ok(bad.failures.includes("missing-embedded-font:EB Garamond"));
    assert.ok(bad.failures.includes("missing-visible-copy:chef:ending"));
  });
});
