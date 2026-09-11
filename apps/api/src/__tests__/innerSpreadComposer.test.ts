import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, GridSpec, NewsImage } from "@newsforge/shared/schemas";
import { composeInnerSpread } from "../services/innerSpreadComposer.js";
import type { StoryModuleInput, StoryModuleMeasurement } from "../services/storyModuleMeasurement.js";

const gridSpec: GridSpec = { label: "inner", columns: 24, rowsPerPage: 16, slots: [] };

const TINY_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function article(id: string, words: number, imageRefs: string[] = [], extra: Partial<Article> = {}): Article {
  const body = Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
  return {
    id,
    title: `Story ${id}`,
    body,
    wordCount: words,
    source: "UPLOAD",
    imageRefs,
    isFiller: false,
    ...extra,
  };
}

function image(id: string, originalName: string): NewsImage {
  return {
    id,
    url: TINY_GIF,
    originalName,
    aspect: "landscape",
    source: "UPLOAD",
    isPlaceholder: false,
  };
}

/** Deterministic synthetic measure: height scales with words + photos. */
async function syntheticMeasure(input: StoryModuleInput): Promise<StoryModuleMeasurement> {
  const words =
    input.article?.wordCount ||
    input.article?.body.trim().split(/\s+/).filter(Boolean).length ||
    0;
  const images = input.images?.length ?? 0;
  const intrinsicHeightPx = Math.max(80, Math.ceil(words * 2.2) + images * 40 + 48);
  return {
    kind: input.kind,
    widthPx: input.widthPx,
    intrinsicHeightPx,
    minHeightPx: intrinsicHeightPx,
    imageAreaPx: images * 120 * 80,
    contentHeightPx: intrinsicHeightPx,
    clipped: false,
    missingImages: [],
    missingFonts: [],
    sourceArticleId: input.article?.id,
    sourceImageIds: (input.images ?? []).map((img) => img.id),
    cacheKey: `synthetic:${input.article?.id ?? "x"}:${input.widthPx}:${words}`,
    measured: true,
  };
}

function contract(extra: Record<string, unknown> = {}) {
  return {
    gridSpec,
    measure: syntheticMeasure,
    styleVersion: "test-style",
    fontVersion: "test-font",
    minBodyFontSizePt: 11.5,
    bodyFontSizePt: 11.5,
    ...extra,
  };
}

describe("inner spread composer (measured)", () => {
  it("returns two pages with complete source/photo coverage and no overlap", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 50, ["a.jpg"]), article("b", 30, ["b.jpg"]), article("c", 20)],
      images: [image("ia", "a.jpg"), image("ib", "b.jpg")],
      contract: contract(),
    });
    assert.equal(result.status, "fit");
    assert.equal(result.layout.pageCount, 2);
    assert.deepEqual(result.omittedRequiredUnitIds, []);
    assert.deepEqual(result.unresolvedRequiredPhotoRefs, []);
    assert.deepEqual(result.contentEdits, []);
    assert.ok(result.pages.every((page) => page.clipCount === 0 && page.overlapCount === 0));
    assert.equal(result.provider, "deterministic");
    assert.equal(result.usedMeasurements, true);
    assert.ok(result.measurementCallCount > 0);
    assert.ok(result.decisionTrace.some((line) => line.includes("measure:storyModule")));
  });

  it("does not resolve an unconfirmed photo reference or claim fit", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 20, ["missing.jpg"])],
      images: [],
      contract: contract(),
    });
    assert.equal(result.status, "overflow");
    assert.deepEqual(result.unresolvedRequiredPhotoRefs, ["missing.jpg"]);
    assert.equal(result.overflow?.reason, "required photo references are unresolved");
    assert.ok(result.overflow?.reviewOptions && result.overflow.reviewOptions.length >= 1);
  });

  it("reports constrained overflow instead of dropping required source units silently", async () => {
    const result = await composeInnerSpread({
      source: Array.from({ length: 10 }, (_, i) => article(String(i), 500)),
      images: [],
      contract: contract(),
    });
    assert.equal(result.status, "overflow");
    assert.ok(result.omittedRequiredUnitIds.length > 0);
    assert.equal(result.contentEdits.length, 0);
    assert.ok(result.overflow?.reviewOptions?.some((opt) => /type floor|never silent/i.test(opt.detail + opt.label)));
  });

  it("records a placement decision for every unit and photo ref (TRI-R04 item 4)", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 50, ["a.jpg"]), article("b", 30, ["b.jpg"]), article("c", 20)],
      images: [image("ia", "a.jpg"), image("ib", "b.jpg")],
      contract: contract(),
    });
    const decisions = result.assetDecisions;
    assert.ok(decisions.length > 0, "assetDecisions must be present");
    for (const unitId of ["a", "b", "c"]) {
      const unitDecisions = decisions.filter((decision) => decision.unitId === unitId && decision.kind !== "photo");
      assert.equal(unitDecisions.length, 1, `unit ${unitId} has exactly one unit-level decision`);
      assert.equal(unitDecisions[0].outcome, "placed");
      assert.ok(unitDecisions[0].page === 2 || unitDecisions[0].page === 3, "composer maps local pages to logical pages 2-3");
    }
    const photoDecisions = decisions.filter((decision) => decision.kind === "photo" && decision.unitId);
    assert.equal(photoDecisions.length, 2);
    assert.ok(photoDecisions.every((decision) => decision.outcome === "placed"));
    assert.deepEqual(result.layout.assetDecisions, decisions, "layout carries the same decisions");
  });

  it("rejects unplaced required units with a stored reason instead of dropping them", async () => {
    const result = await composeInnerSpread({
      source: Array.from({ length: 10 }, (_, i) => article(String(i), 500)),
      images: [],
      contract: contract(),
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
      source: [article("a", 20, ["missing.jpg"])],
      images: [],
      contract: contract(),
    });
    const photoDecision = result.assetDecisions.find(
      (decision) => decision.kind === "photo" && decision.assetId === "missing.jpg",
    );
    assert.ok(photoDecision, "unresolved photo ref has a decision record");
    assert.equal(photoDecision!.outcome, "rejected");
    assert.match(photoDecision!.reason ?? "", /unresolved/i);
  });

  it("places every linked photo for a unit (not only the first two)", async () => {
    const result = await composeInnerSpread({
      source: [article("multi", 40, ["p1.jpg", "p2.jpg", "p3.jpg"])],
      images: [image("i1", "p1.jpg"), image("i2", "p2.jpg"), image("i3", "p3.jpg")],
      contract: contract({ maxCandidates: 3 }),
    });
    const placed = result.layout.blocks.filter((b) => b.imageId).map((b) => b.imageId).sort();
    assert.deepEqual(placed, ["i1", "i2", "i3"]);
    const photoDecisions = result.assetDecisions.filter((d) => d.kind === "photo" && d.unitId === "multi");
    assert.equal(photoDecisions.length, 3);
    assert.ok(photoDecisions.every((d) => d.outcome === "placed"));
  });

  it("preserves unassigned general-gallery images", async () => {
    const result = await composeInnerSpread({
      source: [article("a", 30, ["a.jpg"])],
      images: [image("ia", "a.jpg"), image("gallery1", "extra1.jpg"), image("gallery2", "extra2.jpg")],
      contract: contract(),
    });
    const placedIds = new Set(result.layout.blocks.map((b) => b.imageId).filter(Boolean));
    assert.ok(placedIds.has("ia"));
    assert.ok(placedIds.has("gallery1"), "gallery image 1 must be placed");
    assert.ok(placedIds.has("gallery2"), "gallery image 2 must be placed");
  });

  it("2-story sparse case fits without inventing a fixed module quota", async () => {
    const result = await composeInnerSpread({
      source: [article("s1", 35), article("s2", 28)],
      images: [],
      contract: contract({ maxCandidates: 8 }),
    });
    assert.equal(result.status, "fit");
    assert.equal(result.layout.stats.placedArticles, 2);
    assert.ok(result.layout.blocks.length < 12, "sparse must not force dense module count");
  });

  it("primary 8-unit case produces a valid two-page candidate or honest overflow", async () => {
    const units = Array.from({ length: 8 }, (_, i) =>
      article(`u${i}`, 60 + i * 5, i % 2 === 0 ? [`p${i}.jpg`] : [], { sourceOrder: i }),
    );
    const images = units.flatMap((u, i) => (i % 2 === 0 ? [image(`img${i}`, `p${i}.jpg`)] : []));
    const result = await composeInnerSpread({
      source: units,
      images,
      contract: contract({ maxCandidates: 8 }),
    });
    assert.ok(result.status === "fit" || result.status === "overflow");
    assert.equal(result.layout.pageCount, 2);
    if (result.status === "overflow") {
      assert.ok(result.overflow?.reviewOptions && result.overflow.reviewOptions.length > 0);
      assert.equal(result.contentEdits.length, 0);
    } else {
      assert.deepEqual(result.omittedRequiredUnitIds, []);
    }
    // Every source ending remains represented as placed or explicitly omitted.
    for (const u of units) {
      const placed = result.layout.blocks.some((b) => b.articleId === u.id);
      const omitted = result.omittedRequiredUnitIds.includes(u.id);
      assert.ok(placed || omitted, `unit ${u.id} must be placed or honestly omitted`);
    }
  });

  it("Content5-like long-story case keeps the long unit intact or reports overflow", async () => {
    const longBody = Array.from({ length: 6 }, (_, p) =>
      `Transportation paragraph ${p + 1}. ${"detail ".repeat(40)}`,
    ).join("\n\n");
    const long = article("transport", 240, ["bus.jpg"], {
      title: "Transportation",
      body: longBody,
      wordCount: 240,
    });
    const shorts = [
      article("dir", 40, [], { title: "Director Corner" }),
      article("vol", 25, [], { title: "Volunteers Needed" }),
      article("talent", 20, [], { title: "Talent Call Out" }),
    ];
    const result = await composeInnerSpread({
      source: [long, ...shorts],
      images: [image("bus", "bus.jpg")],
      contract: contract({ maxCandidates: 8 }),
    });
    assert.ok(result.status === "fit" || result.status === "overflow");
    if (result.status === "fit") {
      const transport = result.layout.blocks.find((b) => b.articleId === "transport");
      assert.ok(transport, "long story must be placed whole");
      assert.ok((transport!.position.rowSpan ?? 0) >= 3);
    } else {
      assert.ok(result.overflow?.reason);
      assert.equal(result.contentEdits.length, 0);
    }
  });

  it("dense photo case places all photos or honest infeasibility", async () => {
    const photos = Array.from({ length: 7 }, (_, i) => image(`d${i}`, `dense${i}.jpg`));
    const result = await composeInnerSpread({
      source: [
        article("feat", 50, ["dense0.jpg", "dense1.jpg"]),
        article("side", 30, ["dense2.jpg"]),
      ],
      images: photos,
      contract: contract({ maxCandidates: 8 }),
    });
    assert.ok(result.status === "fit" || result.status === "overflow");
    const placedPhotos = result.layout.blocks.filter((b) => b.imageId).map((b) => b.imageId);
    if (result.status === "fit") {
      assert.equal(new Set(placedPhotos).size, 7, "all dense photos including gallery");
    } else {
      assert.ok(result.overflow?.reviewOptions);
    }
  });

  it("never emits a tall single-row brunch slab for a short schedule", async () => {
    const brunch = article(
      "brunch",
      12,
      [],
      {
        title: "Break for Brunch",
        body: "7/3 Eggs Benedict\n7/10 Pancake Social\n7/17 Bagels",
        wordCount: 12,
        sourceRole: "dated-list",
      },
    );
    const result = await composeInnerSpread({
      source: [brunch, article("other", 40)],
      images: [],
      contract: contract({ maxCandidates: 4 }),
    });
    const block = result.layout.blocks.find((b) => b.articleId === "brunch");
    assert.ok(block);
    assert.ok(
      block!.position.rowSpan <= Math.ceil(gridSpec.rowsPerPage * 0.35),
      `brunch rowSpan ${block!.position.rowSpan} must stay compact`,
    );
    assert.ok(result.decisionTrace.some((t) => t.includes("compact-rail:brunch")));
  });

  it("drives placement from measurement heights (taller copy → more rows)", async () => {
    const heights = new Map<string, number>();
    const measure = async (input: StoryModuleInput): Promise<StoryModuleMeasurement> => {
      const base = await syntheticMeasure(input);
      const id = input.article?.id ?? "?";
      // short story intentionally short; long story tall
      const intrinsicHeightPx = id === "long" ? 520 : 90;
      heights.set(id, intrinsicHeightPx);
      return { ...base, intrinsicHeightPx, contentHeightPx: intrinsicHeightPx, minHeightPx: intrinsicHeightPx };
    };
    const result = await composeInnerSpread({
      source: [article("short", 20), article("long", 200)],
      images: [],
      contract: contract({ measure, maxCandidates: 2 }),
    });
    const short = result.layout.blocks.find((b) => b.articleId === "short");
    const long = result.layout.blocks.find((b) => b.articleId === "long");
    assert.ok(short && long);
    assert.ok(long!.position.rowSpan > short!.position.rowSpan, "measured long story must consume more rows");
  });
});
