import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.AI_UNLOCK_PASSWORD ??= "test";
process.env.INTERNAL_RENDER_SECRET ??= "test";

describe("PDF artifact inspection", () => {
  it("reads the actual two-page specimen and its embedded fonts", async () => {
    const { inspectPdfArtifact } = await import("../services/pdf.js");
    const inspection = await inspectPdfArtifact(
      "docs/trilogy-review-2026-09-09/evidence/TRI-SPEC-2P/specimen.pdf",
      ["Source Sans 3", "EB Garamond"],
    );
    assert.equal(inspection.actualPageCount, 2);
    assert.deepEqual(inspection.missingEmbeddedFonts, []);
    assert.match(inspection.outputHash, /^[a-f0-9]{64}$/);
    assert.ok(inspection.embeddedFonts.some((font) => /SourceSans3/i.test(font)));
    assert.ok(inspection.embeddedFonts.some((font) => /EBGaramond/i.test(font)));
  });

  it("derives spread page expectations from output mode", async () => {
    const { expectedPdfPageCount } = await import("../services/pdf.js");
    assert.equal(expectedPdfPageCount(2, "web"), 2);
    assert.equal(expectedPdfPageCount(2, "print"), 2);
    assert.equal(expectedPdfPageCount(2, "spread"), 1);
    assert.equal(expectedPdfPageCount(4, "spread"), 1);
  });
});
