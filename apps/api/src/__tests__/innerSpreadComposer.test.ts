import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, GridSpec, NewsImage } from "@newsforge/shared/schemas";
import { composeInnerSpread } from "../services/innerSpreadComposer.js";

const gridSpec: GridSpec = { label: "inner", columns: 24, rowsPerPage: 16, slots: [] };
function article(id: string, words: number, imageRefs: string[] = []): Article {
  const body = Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
  return { id, title: `Story ${id}`, body, wordCount: words, source: "UPLOAD", imageRefs, isFiller: false };
}
function image(id: string, originalName: string): NewsImage {
  return { id, url: `/uploads/${originalName}`, originalName, aspect: "landscape", source: "UPLOAD", isPlaceholder: false };
}

describe("inner spread composer", () => {
  it("returns two pages with complete source/photo coverage and no overlap", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 50, ["a.jpg"]), article("b", 30, ["b.jpg"]), article("c", 20)],
      images: [image("ia", "a.jpg"), image("ib", "b.jpg")],
      contract: { gridSpec },
    });
    assert.equal(result.status, "fit");
    assert.equal(result.layout.pageCount, 2);
    assert.deepEqual(result.omittedRequiredUnitIds, []);
    assert.deepEqual(result.unresolvedRequiredPhotoRefs, []);
    assert.deepEqual(result.contentEdits, []);
    assert.ok(result.pages.every((page) => page.clipCount === 0 && page.overlapCount === 0));
    assert.equal(result.provider, "deterministic");
  });

  it("does not resolve an unconfirmed photo reference or claim fit", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 20, ["missing.jpg"])], images: [], contract: { gridSpec },
    });
    assert.equal(result.status, "overflow");
    assert.deepEqual(result.unresolvedRequiredPhotoRefs, ["missing.jpg"]);
    assert.equal(result.overflow?.reason, "required photo references are unresolved");
  });

  it("reports constrained overflow instead of dropping required source units", async () => {
    const result = await composeInnerSpread({
      source: Array.from({ length: 10 }, (_, i) => article(String(i), 500)), images: [], contract: { gridSpec },
    });
    assert.equal(result.status, "overflow");
    assert.ok(result.omittedRequiredUnitIds.length > 0);
    assert.equal(result.contentEdits.length, 0);
  });

  it("records a placement decision for every unit and photo ref (TRI-R04 item 4)", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 50, ["a.jpg"]), article("b", 30, ["b.jpg"]), article("c", 20)],
      images: [image("ia", "a.jpg"), image("ib", "b.jpg")],
      contract: { gridSpec },
    });
    const decisions = result.assetDecisions;
    assert.ok(decisions.length > 0, "assetDecisions must be present");
    // Every source unit is accounted for exactly once.
    for (const unitId of ["a", "b", "c"]) {
      const unitDecisions = decisions.filter((decision) => decision.unitId === unitId && decision.kind !== "photo");
      assert.equal(unitDecisions.length, 1, `unit ${unitId} has exactly one unit-level decision`);
      assert.equal(unitDecisions[0].outcome, "placed");
      assert.ok(unitDecisions[0].page === 2 || unitDecisions[0].page === 3, "composer maps local pages to logical pages 2-3");
    }
    // Placed photos are recorded with their unit.
    const photoDecisions = decisions.filter((decision) => decision.kind === "photo");
    assert.equal(photoDecisions.length, 2);
    assert.ok(photoDecisions.every((decision) => decision.outcome === "placed"));
    assert.deepEqual(result.layout.assetDecisions, decisions, "layout carries the same decisions");
  });

  it("rejects unplaced required units with a stored reason instead of dropping them", async () => {
    const result = await composeInnerSpread({
      source: Array.from({ length: 10 }, (_, i) => article(String(i), 500)), images: [], contract: { gridSpec },
    });
    const omitted = new Set(result.omittedRequiredUnitIds);
    for (const unitId of omitted) {
      const decision = result.assetDecisions.find((candidate) => candidate.unitId === unitId && candidate.kind !== "photo");
      assert.ok(decision, `omitted unit ${unitId} has a decision record`);
      assert.equal(decision!.outcome, "rejected");
      assert.ok(decision!.reason && decision!.reason.trim().length > 0, "rejected unit carries a stored reason");
      assert.ok(decision!.decisionCode, "rejected unit carries a decisionCode");
    }
  });

  it("records unresolved photo refs as rejected with a stored reason", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 20, ["missing.jpg"])], images: [], contract: { gridSpec },
    });
    const photoDecision = result.assetDecisions.find((decision) => decision.kind === "photo" && decision.assetId === "missing.jpg");
    assert.ok(photoDecision, "unresolved photo ref has a decision record");
    assert.equal(photoDecision!.outcome, "rejected");
    assert.match(photoDecision!.reason ?? "", /unresolved/i);
  });
});
