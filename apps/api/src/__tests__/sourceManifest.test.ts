import assert from "node:assert/strict";
import test from "node:test";
import { parsePorterSubmissionFile, parsePorterSubmissionText } from "../services/uploadService.js";
import { buildSourceManifest, sourceUnitFullyResolved, toSourceAssetContract } from "../services/sourceManifest.js";
import { SourceAssetContractSchema } from "@newsforge/shared/schemas";

process.env.DATABASE_URL ??= "postgresql://test:x@127.0.0.1:5432/test";
process.env.AI_UNLOCK_PASSWORD ??= "test-unlock";
process.env.INTERNAL_RENDER_SECRET ??= "test-render";

const ashford = "/home/tom/.hermes/plans/newsforge-demo-2026-09-10/inputs/ashford/Ashford_Place_July_Newsletter_Content.docx";

test("Ashford real DOCX preserves captions, birthday facts, and supplied signature", async () => {
  const parsed = await parsePorterSubmissionFile(ashford);
  assert.equal(parsed.birthdayPresent, true);
  const birthday = parsed.lists.find((list) => list.panelRole === "birthday");
  assert.ok(birthday);
  assert.equal(birthday.rows.filter((row) => row.value).length, 13);
  assert.ok(birthday.rows.some((row) => row.label === "Lillie-Ann B." && row.value === "7/28"));
  assert.ok(parsed.captions["Zach Simpson.jpg"]?.includes("Executive Director"));
  assert.ok(parsed.articles[0]?.byline?.includes("Zach Simpson"));
  assert.ok(parsed.articles.find((article) => article.title === "Outings")?.imageRefs?.length === 2);
});

test("Photos paragraph attaches to the preceding feature and instruction prose is excluded", () => {
  const parsed = parsePorterSubmissionText(`Required Articles\n\nREQUIRED - INTERESTING AND NEWSWORTHY\n\nA complete story about residents and community activities.\n\nPhotos: Photo 1.jpg\n\nREQUIRED - PHOTO CAPTIONS\n\nList the file names with the corresponding captions here. Photo 1.jpg - A real caption (Article: Story)\n\nOptional Article Suggestions`);
  assert.deepEqual(parsed.articles[0]?.imageRefs, ["Photo 1.jpg"]);
  assert.equal(parsed.captions["Photo 1.jpg"], "A real caption");
  assert.equal(parsed.articles[0]?.body.includes("Photos:"), false);
});

test("manifest resolves each reference independently and is stable under image reorder", () => {
  const parsed = parsePorterSubmissionText("Required Articles\n\nREQUIRED - Legacy News\n\nStory body with enough content to parse. Photos: Photo 1.jpg, Photo 10.jpg\n\nOptional Article Suggestions");
  const images = [
    { id: "one", url: "/uploads/one.jpg", originalName: "Photo 1.jpg", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
    { id: "ten", url: "/uploads/ten.jpg", originalName: "Photo 10.jpg", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
  ] as const;
  const a = buildSourceManifest({ parsed, images: [...images] });
  const b = buildSourceManifest({ parsed, images: [...images].reverse() });
  assert.deepEqual(a.units[0]?.photoLinks, b.units[0]?.photoLinks);
  assert.equal(a.units[0]?.photoLinks.length, 2);
  assert.equal(a.units[0]?.photoLinks.every((link) => link.status === "exact"), true);
  assert.equal(sourceUnitFullyResolved(a.units[0]!), true);
  const unresolved = buildSourceManifest({ parsed, images: [images[0]] });
  assert.equal(unresolved.units[0]?.photoLinks[1]?.status, "unresolved");
  assert.equal(sourceUnitFullyResolved(unresolved.units[0]!), false);
});

test("two-photo story with one exact + one semantic-assigned is NOT fully resolved (TRI-R04b3 acceptance)", () => {
  // One reference resolves by exact filename; the other is filled in by the
  // semantic pass. Both links now point at real images — yet the unit must
  // still be reported as NOT fully resolved: a semantic assignment is a
  // suggestion the operator can still change, not a confirmation.
  const parsed = parsePorterSubmissionText(
    "Required Articles\n\nREQUIRED - Legacy News\n\nVeterans remembered their military service. Photos: Legacy 1.jpg, Legacy 2.jpg\n\nOptional Article Suggestions",
  );
  const manifest = buildSourceManifest({ parsed, images: [
    { id: "exact", url: "exact.jpg", originalName: "Legacy 1.jpg", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
    { id: "inferred", url: "inferred.jpg", originalName: "photo9.jpg", description: "Two veterans recalling their military service with medals", tags: ["military", "veteran", "service"], analysisStatus: "fixture", contentAnalysis: { scene: "Two veterans recalling their military service with medals", objects: ["military", "veteran", "service"], provider: "fixture", model: "test", promptVersion: "trilogy-r05-v1" }, aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
  ] as never[] });
  const unit = manifest.units[0]!;
  assert.equal(unit.photoLinks[0]?.status, "exact");
  assert.equal(unit.photoLinks[0]?.imageId, "exact");
  assert.equal(unit.photoLinks[1]?.status, "semantic-assigned");
  assert.equal(unit.photoLinks[1]?.imageId, "inferred");
  assert.equal(sourceUnitFullyResolved(unit), false);
});

test("unresolved references receive semantic reasoning without filename evidence", () => {
  const parsed = parsePorterSubmissionText("Required Articles\n\nREQUIRED - Legacy News\n\nVeterans remembered their military service. Photos: Legacy.jpg, Legacy 2.jpg\n\nOptional Article Suggestions");
  const manifest = buildSourceManifest({ parsed, images: [
    { id: "veteran", url: "veteran.jpg", originalName: "photo2.jpg", description: "Two veterans recalling WWII, Korea, Air Force and Vietnam service", tags: ["military", "community", "veteran", "service"], analysisStatus: "fixture", contentAnalysis: { scene: "Two veterans recalling WWII, Korea, Air Force and Vietnam service", objects: ["military", "veteran", "service"], provider: "fixture", model: "test", promptVersion: "trilogy-r05-v1" }, aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
    { id: "meal", url: "meal.jpg", originalName: "photo5.jpg", description: "Residents sharing a meal at the dining table", tags: ["food", "meal", "dining"], analysisStatus: "fixture", contentAnalysis: { scene: "Residents sharing a meal at the dining table", objects: ["food", "meal"], provider: "fixture", model: "test", promptVersion: "trilogy-r05-v1" }, aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
  ] as never[] });
  const unit = manifest.units[0]!;
  assert.equal(unit.photoAssignments?.length, 2);
  assert.equal(unit.photoAssignments?.[0]?.chosenImageId, "veteran");
  assert.equal(unit.photoAssignments?.[0]?.status, "assigned");
  assert.ok(unit.photoAssignments?.[0]?.why);
  assert.ok(Array.isArray(unit.photoAssignments?.[0]?.alternates));
  assert.equal(unit.photoAssignments?.[1]?.status, "unassigned");
  assert.match(unit.photoAssignments?.[1]?.why ?? "", /UNASSIGNED/);
  assert.equal(unit.photoLinks[0]?.status, "semantic-assigned");
  assert.equal(unit.photoLinks[1]?.status, "unresolved");
});


test("manifest marks normalized filename collisions ambiguous", () => {
  const parsed = parsePorterSubmissionText("Required Articles\n\nREQUIRED - Legacy News\n\nStory body with enough content. Photos: Photo.jpg\n\nOptional Article Suggestions");
  const manifest = buildSourceManifest({ parsed, images: [
    { id: "a", url: "a", originalName: "Photo.jpg", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
    { id: "b", url: "b", originalName: "photo", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
  ] as never[] });
  assert.equal(manifest.units[0]?.photoLinks[0]?.status, "ambiguous");
});

// ── R05 regression: upload order must not change confirmed assignments ──
// For each scenario the manifest is built twice — once per upload order —
// and the confirmed (resolved) assignments must be identical.

function confirmedAssignments(manifest: ReturnType<typeof buildSourceManifest>) {
  return manifest.units.map((unit) =>
    unit.photoLinks.map((link) => ({ ref: link.originalRef, imageId: link.imageId, status: link.status, provenance: link.provenance })),
  );
}

const uploadImage = (id: string, originalName: string, extra: Record<string, unknown> = {}) => ({
  id, url: `/uploads/${id}.jpg`, originalName, aspect: "landscape", isPlaceholder: false, source: "UPLOAD", ...extra,
}) as unknown as import("@newsforge/shared/schemas").NewsImage;

test("R05-1: unit0 exact 'Photo 1.jpg' + unresolved 'Photo 2.jpg' / unit1 exact 'Photo 1.jpg' + 'Photo 3.jpg' — stable under upload reorder", () => {
  const parsed = parsePorterSubmissionText(
    "Required Articles\n\nREQUIRED - INTERESTING AND NEWSWORTHY\n\nResidents shared a lively afternoon together. Photos: Photo 1.jpg, Photo 2.jpg\n\nThe community celebrated the season. Photos: Photo 1.jpg, Photo 3.jpg\n\nOptional Article Suggestions",
  );
  const ordered = [uploadImage("p1", "Photo 1.jpg"), uploadImage("p3", "Photo 3.jpg")];
  const a = buildSourceManifest({ parsed, images: ordered });
  const b = buildSourceManifest({ parsed, images: [...ordered].reverse() });

  assert.deepEqual(confirmedAssignments(a), confirmedAssignments(b));

  const [u0, u1] = [a.units[0]!, a.units[1]!];
  assert.equal(u0.photoLinks[0]?.originalRef, "Photo 1.jpg");
  assert.equal(u0.photoLinks[0]?.imageId, "p1");
  assert.equal(u0.photoLinks[0]?.status, "exact");
  assert.equal(u0.photoLinks[1]?.originalRef, "Photo 2.jpg");
  assert.equal(u0.photoLinks[1]?.imageId, undefined);
  assert.equal(u0.photoLinks[1]?.status, "unresolved");
  assert.equal(u1.photoLinks[0]?.imageId, "p1");
  assert.equal(u1.photoLinks[0]?.status, "exact");
  assert.equal(u1.photoLinks[1]?.imageId, "p3");
  assert.equal(u1.photoLinks[1]?.status, "exact");
});

test("R05-2: unit0 + unit1 both unresolved / unit2 exact 'Photo 1.jpg' — stable under upload reorder", () => {
  const parsed = parsePorterSubmissionText(
    "Required Articles\n\nREQUIRED - INTERESTING AND NEWSWORTHY\n\nThe Alpha program held its garden day. Photos: Alpha.jpg\n\nThe Beta club enjoyed a social afternoon. Photos: Beta.jpg\n\nThe season opened with a garden party. Photos: Photo 1.jpg\n\nOptional Article Suggestions",
  );
  const ordered = [
    uploadImage("photo1", "Photo 1.jpg", {
      description: "Community Alpha program garden day",
      tags: ["alpha", "garden", "community"],
      analysisStatus: "fixture",
      contentAnalysis: {
        scene: "Community Alpha program garden day",
        objects: ["alpha", "garden", "community"],
        provider: "fixture",
        model: "test",
        promptVersion: "trilogy-r05-v1",
      },
    }),
    uploadImage("photo2", "Photo 2.jpg", {
      description: "Beta club social afternoon",
      tags: ["beta", "social", "community"],
      analysisStatus: "fixture",
      contentAnalysis: {
        scene: "Beta club social afternoon",
        objects: ["beta", "social", "community"],
        provider: "fixture",
        model: "test",
        promptVersion: "trilogy-r05-v1",
      },
    }),
  ];
  const a = buildSourceManifest({ parsed, images: ordered });
  const b = buildSourceManifest({ parsed, images: [...ordered].reverse() });

  assert.deepEqual(confirmedAssignments(a), confirmedAssignments(b));

  const [u0, u1, u2] = [a.units[0]!, a.units[1]!, a.units[2]!];
  // Exact Photo 1.jpg is reserved first; inferred matching cannot steal it.
  assert.equal(u2.photoLinks[0]?.originalRef, "Photo 1.jpg");
  assert.equal(u2.photoLinks[0]?.imageId, "photo1");
  assert.equal(u2.photoLinks[0]?.status, "exact");
  assert.equal(sourceUnitFullyResolved(u2), true);
  // Alpha/Beta use remaining evidence photos without duplicating photo1.
  assert.notEqual(u0.photoLinks[0]?.imageId, "photo1");
  assert.notEqual(u1.photoLinks[0]?.imageId, "photo1");
  const claimed = [u0.photoLinks[0]?.imageId, u1.photoLinks[0]?.imageId, u2.photoLinks[0]?.imageId].filter(Boolean);
  assert.equal(new Set(claimed).size, claimed.length);
});

test("R05-3: unit0 exact 'Photo 1.jpg' / unit1 unresolved 'Photo 2.jpg' + 'Photo 3.jpg' — stable under upload reorder", () => {
  const parsed = parsePorterSubmissionText(
    "Required Articles\n\nREQUIRED - INTERESTING AND NEWSWORTHY\n\nThe season opened with a garden party. Photos: Photo 1.jpg\n\nNeighbors gathered for the fall market. Photos: Photo 2.jpg, Photo 3.jpg\n\nOptional Article Suggestions",
  );
  const ordered = [uploadImage("one", "Photo 1.jpg"), uploadImage("twelve", "Photo 12.jpg")];
  const a = buildSourceManifest({ parsed, images: ordered });
  const b = buildSourceManifest({ parsed, images: [...ordered].reverse() });

  assert.deepEqual(confirmedAssignments(a), confirmedAssignments(b));

  const [u0, u1] = [a.units[0]!, a.units[1]!];
  assert.equal(u0.photoLinks[0]?.imageId, "one");
  assert.equal(u0.photoLinks[0]?.status, "exact");
  assert.equal(u1.photoLinks[0]?.originalRef, "Photo 2.jpg");
  assert.equal(u1.photoLinks[0]?.imageId, undefined);
  assert.equal(u1.photoLinks[0]?.status, "unresolved");
  assert.equal(u1.photoLinks[1]?.originalRef, "Photo 3.jpg");
  assert.equal(u1.photoLinks[1]?.imageId, undefined);
  assert.equal(u1.photoLinks[1]?.status, "unresolved");
  assert.equal(sourceUnitFullyResolved(u1), false);
  // 'Photo 12.jpg' must not collide with the 'Photo 1.jpg' exact match.
  assert.equal(a.units[0]?.photoLinks[0]?.status, "exact");
  assert.ok(!a.units[0]?.photoLinks.some((link) => link.imageId === "twelve"));
});

test("toSourceAssetContract round-trips through the canonical schema", () => {
  const parsed = parsePorterSubmissionText(
    "Required Articles\n\nREQUIRED - INTERESTING AND NEWSWORTHY\n\nA story about the annual garden party. Photos: Photo 1.jpg, Photo 2.jpg\n\nOptional Article Suggestions",
  );
  const manifest = buildSourceManifest({ parsed, images: [uploadImage("a", "Photo 1.jpg"), uploadImage("b", "Photo 2.jpg")], captions: { "Photo 1.jpg": "The garden party crowd" } });
  const contract = toSourceAssetContract(manifest);

  // Round-trip: re-parsing the projected contract against the canonical
  // schema must succeed and be lossless.
  const revalidated = SourceAssetContractSchema.parse(JSON.parse(JSON.stringify(contract)));
  assert.deepEqual(revalidated, contract);

  assert.equal(contract.version, 1);
  assert.equal(contract.units.length, manifest.units.length);
  assert.equal(contract.units.length, 1);
  assert.equal(contract.links.length, 2);
  assert.ok(contract.reservations.length >= 2);
  assert.ok(contract.assetDecisions.length >= 3, "unit + one decision per photo link");
  const link = contract.units[0]?.links.find((candidate) => candidate.originalRef === "Photo 1.jpg");
  assert.equal(link?.resolvedImageId, "a");
  assert.equal(link?.provenance, "exact");
  assert.equal(link?.caption, "The garden party crowd");
});
