import assert from "node:assert/strict";
import test from "node:test";
import type { NewsImage } from "@newsforge/shared/schemas";
import {
  assignUnresolvedPhotos,
  assignUnresolvedPhotosGlobally,
} from "../services/photoAssignment.js";
import { chooseSubjectSafeCrop, coverClipsSubject } from "../services/subjectSafeCrop.js";
import { hasVisibleImageEvidence, applyImageDescription } from "../services/imageDescription.js";
import { buildSourceManifest } from "../services/sourceManifest.js";
import { parsePorterSubmissionText } from "../services/uploadService.js";

process.env.DATABASE_URL ??= "postgresql://test:***@127.0.0.1:5432/test";
process.env.AI_UNLOCK_PASSWORD ??= "test-unlock";
process.env.INTERNAL_RENDER_SECRET ??= "test-render";

function fixtureImage(
  id: string,
  originalName: string,
  scene: string,
  extra: Partial<NewsImage> & {
    objects?: string[];
    peopleCount?: number;
    subjectBounds?: { left: number; top: number; right: number; bottom: number };
  } = {},
): NewsImage {
  const { objects = [], peopleCount, subjectBounds, ...rest } = extra;
  return {
    id,
    url: `/uploads/${id}.jpg`,
    originalName,
    aspect: rest.aspect ?? "landscape",
    isPlaceholder: false,
    source: "UPLOAD",
    description: scene,
    tags: objects,
    analysisStatus: "fixture",
    contentAnalysis: {
      scene,
      objects,
      orientation: rest.aspect ?? "landscape",
      peopleCount,
      subjectBounds,
      provider: "fixture",
      model: "test",
      promptVersion: "trilogy-r05-v1",
    },
    width: rest.width ?? 1600,
    height: rest.height ?? 1000,
    ...rest,
  };
}

test("Legacy section title alone does not assign veterans photo (no Legacy→veteran shortcut)", () => {
  const article = {
    title: "Legacy News",
    body: "Residents shared memories from decades of community life on campus.",
  };
  const images = [
    fixtureImage("veteran", "photo2.jpg", "Two older adults wearing military service medals and veteran caps", {
      objects: ["medals", "caps", "military", "veteran"],
      peopleCount: 2,
    }),
    fixtureImage("meal", "photo5.jpg", "Couple at a dining table, one lifting a fork of food", {
      objects: ["meal", "fork", "dining", "food"],
      peopleCount: 2,
    }),
  ];
  const assignments = assignUnresolvedPhotos(article, ["Legacy.jpg"], images);
  assert.equal(assignments[0]?.status, "unassigned");
  assert.match(assignments[0]?.why ?? "", /UNASSIGNED|threshold|no uploaded/i);
});

test("Dining photo is a plausible culinary assignment for Chef Circle story", () => {
  const article = {
    title: "Chef Circle",
    body: "Our culinary team invites residents to a meal featuring seasonal recipes and dining tips.",
  };
  const images = [
    fixtureImage("veteran", "photo2.jpg", "Two older adults wearing military service medals", {
      objects: ["medals", "veteran", "military"],
      peopleCount: 2,
    }),
    fixtureImage("meal", "photo5.jpg", "Couple at a dining table, one lifting a fork of food", {
      objects: ["meal", "fork", "dining", "food", "culinary"],
      peopleCount: 2,
    }),
    fixtureImage("bubbles", "photo7.jpg", "Grandparents and a child blowing bubbles outdoors", {
      objects: ["bubbles", "child", "outdoors"],
      peopleCount: 3,
    }),
  ];
  const assignments = assignUnresolvedPhotos(article, ["Chefs Circle.jpg"], images);
  assert.equal(assignments[0]?.status, "assigned");
  assert.equal(assignments[0]?.chosenImageId, "meal");
});

test("Military story can select veterans from visible evidence, not filename", () => {
  const article = {
    title: "Legacy News",
    body: "Veterans remembered their military service from WWII, Korea, and Vietnam.",
  };
  const images = [
    fixtureImage("veteran", "photo2.jpg", "Two older adults wearing military service medals and veteran caps", {
      objects: ["medals", "veteran", "military", "service"],
      peopleCount: 2,
    }),
    fixtureImage("meal", "photo5.jpg", "Couple at a dining table lifting a fork of food", {
      objects: ["meal", "food", "dining"],
      peopleCount: 2,
    }),
  ];
  const assignments = assignUnresolvedPhotos(article, ["Legacy.jpg", "Legacy 2.jpg"], images);
  assert.equal(assignments[0]?.chosenImageId, "veteran");
  assert.equal(assignments[0]?.status, "assigned");
  assert.equal(assignments[1]?.status, "unassigned");
});

test("No visible evidence leaves slots unassigned and records provider fallback", () => {
  const images: NewsImage[] = [
    {
      id: "opaque",
      url: "/x.jpg",
      originalName: "photo1.jpg",
      aspect: "landscape",
      isPlaceholder: false,
      source: "UPLOAD",
      analysisStatus: "unavailable",
      contentAnalysis: {
        scene: "",
        objects: [],
        provider: "none",
        model: "none",
        promptVersion: "trilogy-r05-v1",
      },
    },
  ];
  assert.equal(hasVisibleImageEvidence(images[0]!), false);
  const assignments = assignUnresolvedPhotos(
    { title: "Chef Circle", body: "A culinary meal with recipes." },
    ["Chefs Circle.jpg"],
    images,
  );
  assert.equal(assignments[0]?.status, "unassigned");
  assert.match(assignments[0]?.why ?? "", /image analysis unavailable|not used as image inspection/i);
});

test("Global assignment never duplicates an image across slots", () => {
  const slots = [
    {
      unitId: "u1",
      originalRef: "A.jpg",
      article: { title: "Chef Circle", body: "Culinary dining meal with fork and recipes." },
    },
    {
      unitId: "u2",
      originalRef: "B.jpg",
      article: { title: "Chef Circle encore", body: "Another dining meal culinary feature." },
    },
  ];
  const images = [
    fixtureImage("meal", "photo5.jpg", "Dining table meal with fork of food", {
      objects: ["meal", "dining", "food", "culinary", "fork"],
      peopleCount: 2,
    }),
  ];
  const result = assignUnresolvedPhotosGlobally(slots, images);
  const chosen = result.map((r) => r.chosenImageId).filter(Boolean);
  assert.equal(chosen.length, 1);
  assert.equal(new Set(chosen).size, 1);
});

test("Exact reservations win before inferred matching; no duplicate placement", () => {
  const parsed = parsePorterSubmissionText(
    "Required Articles\n\nREQUIRED - INTERESTING AND NEWSWORTHY\n\nThe Alpha program held its garden day. Photos: Alpha.jpg\n\nThe Beta club enjoyed a social afternoon. Photos: Beta.jpg\n\nThe season opened with a garden party. Photos: Photo 1.jpg\n\nOptional Article Suggestions",
  );
  const ordered = [
    fixtureImage("photo1", "Photo 1.jpg", "Community Alpha program garden day", {
      objects: ["alpha", "garden", "community"],
    }),
    fixtureImage("photo2", "Photo 2.jpg", "Beta club social afternoon gathering", {
      objects: ["beta", "social", "community"],
    }),
  ];
  const a = buildSourceManifest({ parsed, images: ordered });
  const b = buildSourceManifest({ parsed, images: [...ordered].reverse() });
  const confirmed = (m: typeof a) =>
    m.units.map((u) => u.photoLinks.map((l) => ({ ref: l.originalRef, id: l.imageId, st: l.status })));
  assert.deepEqual(confirmed(a), confirmed(b));

  // Exact Photo 1.jpg is reserved for unit2; Alpha cannot steal it.
  assert.equal(a.units[2]?.photoLinks[0]?.status, "exact");
  assert.equal(a.units[2]?.photoLinks[0]?.imageId, "photo1");
  assert.notEqual(a.units[0]?.photoLinks[0]?.imageId, "photo1");
  // photo1 used once only
  const allIds = a.units.flatMap((u) => u.photoLinks.map((l) => l.imageId).filter(Boolean));
  assert.equal(allIds.filter((id) => id === "photo1").length, 1);
});

test("Five-person and chess pair use contain on a narrow rail; wide family not forced cover", () => {
  const five = fixtureImage(
    "five",
    "photo3.jpg",
    "Five laughing seniors standing together under a tree",
    {
      objects: ["group", "seniors", "tree", "community"],
      peopleCount: 5,
      width: 1800,
      height: 1000,
      subjectBounds: { left: 5, top: 15, right: 95, bottom: 90 },
    },
  );
  const chess = fixtureImage(
    "chess",
    "photo4.jpg",
    "Couple on a picnic blanket playing chess outdoors",
    {
      objects: ["chess", "picnic", "blanket", "leisure"],
      peopleCount: 2,
      width: 1600,
      height: 1000,
      subjectBounds: { left: 12, top: 20, right: 88, bottom: 85 },
    },
  );
  const family = fixtureImage(
    "family",
    "photo6.jpg",
    "Multigenerational family at a red white and blue cookout table",
    {
      objects: ["family", "cookout", "table", "celebration"],
      peopleCount: 6,
      width: 2000,
      height: 1100,
      subjectBounds: { left: 4, top: 18, right: 96, bottom: 92 },
    },
  );

  const narrow = { aspectRatio: 0.55, label: "narrow-rail" };
  const fiveCrop = chooseSubjectSafeCrop(five, narrow);
  const chessCrop = chooseSubjectSafeCrop(chess, narrow);
  const familyCrop = chooseSubjectSafeCrop(family, narrow);

  assert.equal(fiveCrop.fitMode, "contain");
  assert.equal(fiveCrop.clipsSubject, false);
  assert.equal(chessCrop.fitMode, "contain");
  assert.ok(familyCrop.fitMode === "contain" || familyCrop.saferFrameAspects.length > 0);
  assert.ok(fiveCrop.alternatives.some((a) => a.fitMode === "contain"));
  assert.ok(familyCrop.saferFrameAspects.some((a) => a > 1));

  // Cover on a matching wide frame should be allowed for chess when subject fits.
  const wide = { aspectRatio: 1.6, label: "wide-feature" };
  const chessWide = chooseSubjectSafeCrop(chess, wide);
  assert.equal(chessWide.fitMode, "cover");
  assert.equal(
    coverClipsSubject(
      1.6,
      1.6,
      chess.contentAnalysis!.subjectBounds!,
      chessWide.focalX,
      chessWide.focalY,
    ),
    false,
  );
});

test("applyImageDescription marks unavailable without inventing scene text", () => {
  const base = fixtureImage("x", "photo1.jpg", "should be cleared");
  const out = applyImageDescription(base, {
    ok: false,
    analysisStatus: "unavailable",
    reason: "no_vision_provider",
    provider: "none",
    durationMs: 1,
  });
  assert.equal(out.analysisStatus, "unavailable");
  assert.equal(out.contentAnalysis?.provider, "none");
  assert.equal(out.contentAnalysis?.scene, "");
});

test("Assignment decisions are stable under image shuffle", () => {
  const article = {
    title: "Chef Circle",
    body: "Culinary dining meal recipes with a fork at the table.",
  };
  const images = [
    fixtureImage("a", "photo1.jpg", "Outdoor garden walk with flowers", { objects: ["garden", "flowers"] }),
    fixtureImage("b", "photo5.jpg", "Dining meal with fork of food on a plate", {
      objects: ["dining", "meal", "food", "fork", "culinary"],
    }),
    fixtureImage("c", "photo2.jpg", "Military medals and veteran caps", { objects: ["military", "veteran"] }),
  ];
  const left = assignUnresolvedPhotos(article, ["Chefs Circle.jpg"], images);
  const right = assignUnresolvedPhotos(article, ["Chefs Circle.jpg"], [...images].reverse());
  assert.equal(left[0]?.chosenImageId, right[0]?.chosenImageId);
  assert.equal(left[0]?.chosenImageId, "b");
});
