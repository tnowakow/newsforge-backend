import assert from "node:assert/strict";
import test from "node:test";
import { parsePorterSubmissionFile, parsePorterSubmissionText } from "../services/uploadService.js";
import { buildSourceManifest, sourceUnitFullyResolved } from "../services/sourceManifest.js";

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

test("manifest marks normalized filename collisions ambiguous", () => {
  const parsed = parsePorterSubmissionText("Required Articles\n\nREQUIRED - Legacy News\n\nStory body with enough content. Photos: Photo.jpg\n\nOptional Article Suggestions");
  const manifest = buildSourceManifest({ parsed, images: [
    { id: "a", url: "a", originalName: "Photo.jpg", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
    { id: "b", url: "b", originalName: "photo", aspect: "landscape", isPlaceholder: false, source: "UPLOAD" },
  ] as never[] });
  assert.equal(manifest.units[0]?.photoLinks[0]?.status, "ambiguous");
});
