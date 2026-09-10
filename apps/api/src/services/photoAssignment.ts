/**
 * TRI-R05 — photo→story assignment from visible image evidence.
 *
 * Rules:
 * 1. Exact / operator-confirmed links are reserved upstream (sourceManifest).
 * 2. Remaining slots are ranked globally on pixel-derived (or fixture) evidence.
 * 3. No Legacy→veteran alias shortcut. No filename evidence.
 * 4. When vision/analysis is unavailable, slots stay UNASSIGNED — never claim
 *    a metadata word-overlap scorer is "image inspection".
 * 5. Weak evidence → ambiguous/unassigned rather than a forced topical guess
 *    that a test photo documents a particular real event.
 */
import type { NewsImage } from "@newsforge/shared/schemas";
import { hasVisibleImageEvidence, visibleEvidenceText } from "./imageDescription.js";

export type PhotoAssignmentAlternative = {
  imageId: string;
  score: number;
  why: string;
};

export type PhotoAssignment = {
  originalRef: string;
  unitId?: string;
  chosenImageId?: string;
  status: "assigned" | "unassigned" | "ambiguous";
  confidence: number;
  why: string;
  alternates: PhotoAssignmentAlternative[];
  evidenceProvider?: string;
};

export type AssignmentArticle = { title: string; body: string };

export type AssignmentSlot = {
  unitId: string;
  originalRef: string;
  article: AssignmentArticle;
};

const STOP_WORDS = new Set(
  "a an and are as at be by for from in is it of on or that the their this to with our your you we will can has have had was were been being its they them than then".split(
    " ",
  ),
);

/** Thematic tokens that must come from visible evidence, never section-title aliases. */
const CULINARY = new Set(["chef", "food", "meal", "dining", "culinary", "restaurant", "fork", "plate", "kitchen", "brunch", "lunch", "dinner", "eat", "eating"]);
const MILITARY = new Set(["veteran", "veterans", "military", "service", "war", "medal", "uniform", "wwii", "korea", "vietnam", "force"]);
const FAMILY_EVENT = new Set(["family", "cookout", "picnic", "celebration", "anniversary", "parade", "flag", "july", "multigenerational"]);
const LEISURE = new Set(["chess", "game", "games", "cards", "leisure", "picnic", "blanket"]);
const COMMUNITY = new Set(["community", "group", "residents", "seniors", "laughing", "tree", "campus"]);

function tokens(value: string): Set<string> {
  const result = new Set<string>();
  for (const token of value.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (token.length > 2 && !STOP_WORDS.has(token)) result.add(token);
  }
  return result;
}

function articleTokens(article: AssignmentArticle): Set<string> {
  // Use body heavily; title alone must NOT drive Legacy→veteran shortcuts.
  return tokens(`${article.title} ${article.body}`);
}

function scorePair(article: AssignmentArticle, image: NewsImage): { score: number; overlap: string[]; thematic: string[] } {
  if (!hasVisibleImageEvidence(image)) {
    return { score: 0, overlap: [], thematic: [] };
  }
  const aTokens = articleTokens(article);
  const iTokens = tokens(visibleEvidenceText(image));
  const overlap = [...aTokens].filter((t) => iTokens.has(t)).sort();
  let score = overlap.length;

  const thematic: string[] = [];
  const body = `${article.title} ${article.body}`.toLowerCase();
  const img = visibleEvidenceText(image).toLowerCase();

  const boost = (label: string, keys: Set<string>, articleHint: RegExp) => {
    const imgHit = [...keys].some((k) => iTokens.has(k) || img.includes(k));
    const artHit = articleHint.test(body) || [...keys].some((k) => aTokens.has(k));
    if (imgHit && artHit) {
      score += 3;
      thematic.push(label);
    }
  };

  // Culinary story ↔ dining photo (not forced by filename Chef Circle.jpg).
  boost("culinary", CULINARY, /chef|culin|dining|meal|menu|food|brunch|recipe/i);
  // Military/service content in BOTH story and photo — not "Legacy" section title alone.
  boost("military-service", MILITARY, /veteran|military|war|medal|armed forces|service member/i);
  boost("family-event", FAMILY_EVENT, /family|anniversary|cookout|celebration|july|parade|multigenerational/i);
  boost("leisure", LEISURE, /chess|game|cards|leisure|picnic/i);
  boost("community", COMMUNITY, /community|resident|together|campus|group|friends/i);

  // Penalize claiming a thematically loose people-photo documents a specific event.
  if (score > 0 && thematic.length === 0 && overlap.length <= 1) {
    score = Math.min(score, 1);
  }

  return { score, overlap, thematic };
}

const MIN_ASSIGN_SCORE = 2;

/**
 * Global ranking of unresolved slots against available images.
 * Deterministic: stable sort by score desc, then unitId, ref, imageId.
 */
export function assignUnresolvedPhotosGlobally(
  slots: AssignmentSlot[],
  images: NewsImage[],
  reservedImageIds: Set<string> = new Set(),
): PhotoAssignment[] {
  const available = images.filter((image) => !reservedImageIds.has(image.id));
  const anyEvidence = available.some((image) => hasVisibleImageEvidence(image));
  const evidenceProvider =
    available.find((image) => image.contentAnalysis?.provider)?.contentAnalysis?.provider ??
    available.find((image) => image.analysisStatus)?.analysisStatus ??
    "none";

  if (!anyEvidence) {
    return slots.map((slot) => ({
      unitId: slot.unitId,
      originalRef: slot.originalRef,
      status: "unassigned" as const,
      confidence: 0,
      alternates: [],
      evidenceProvider: String(evidenceProvider),
      why: `UNASSIGNED: image analysis unavailable (provider=${evidenceProvider}); no pixel-derived evidence to inspect. Manual choice required — metadata word-overlap was not used as image inspection.`,
    }));
  }

  type Cand = {
    slotIndex: number;
    imageId: string;
    score: number;
    overlap: string[];
    thematic: string[];
  };
  const candidates: Cand[] = [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    const slot = slots[slotIndex]!;
    for (const image of available) {
      const { score, overlap, thematic } = scorePair(slot.article, image);
      if (score <= 0) continue;
      candidates.push({ slotIndex, imageId: image.id, score, overlap, thematic });
    }
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer earlier slots (source order) so multi-ref stories fill first ref first.
    if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
    return a.imageId.localeCompare(b.imageId);
  });

  const assignedSlot = new Set<number>();
  const assignedImage = new Set<string>();
  const choice = new Map<number, Cand>();

  for (const cand of candidates) {
    if (cand.score < MIN_ASSIGN_SCORE) continue;
    if (assignedSlot.has(cand.slotIndex) || assignedImage.has(cand.imageId)) continue;
    // Ambiguity: another image within 1 point for same slot → leave unassigned.
    const rivals = candidates.filter(
      (c) =>
        c.slotIndex === cand.slotIndex &&
        c.imageId !== cand.imageId &&
        !assignedImage.has(c.imageId) &&
        c.score >= cand.score - 1 &&
        c.score >= MIN_ASSIGN_SCORE,
    );
    if (rivals.length > 0 && rivals[0]!.score === cand.score) {
      // Mark later as ambiguous when we materialize results.
      choice.set(cand.slotIndex, { ...cand, score: -1 }); // sentinel ambiguous
      assignedSlot.add(cand.slotIndex);
      continue;
    }
    choice.set(cand.slotIndex, cand);
    assignedSlot.add(cand.slotIndex);
    assignedImage.add(cand.imageId);
  }

  return slots.map((slot, slotIndex) => {
    const ranked = available
      .map((image) => {
        const s = scorePair(slot.article, image);
        return { image, ...s };
      })
      .sort((a, b) => b.score - a.score || a.image.id.localeCompare(b.image.id));
    const alternates = ranked.slice(0, 4).map(({ image, score, thematic }) => ({
      imageId: image.id,
      score,
      why:
        score >= MIN_ASSIGN_SCORE
          ? `visible evidence score ${score}${thematic.length ? ` (${thematic.join(", ")})` : ""}`
          : score > 0
            ? "weak visible overlap only — below assignment threshold"
            : "no visible evidence overlap with this story",
    }));

    const picked = choice.get(slotIndex);
    if (picked && picked.score < 0) {
      return {
        unitId: slot.unitId,
        originalRef: slot.originalRef,
        status: "ambiguous" as const,
        confidence: 0.35,
        alternates,
        evidenceProvider: String(evidenceProvider),
        why: "AMBIGUOUS: multiple photos have similar visible-evidence scores for this story; manual choice required. No forced event claim.",
      };
    }
    if (!picked || picked.score < MIN_ASSIGN_SCORE) {
      const best = ranked[0];
      const bestTaken = best && assignedImage.has(best.image.id);
      return {
        unitId: slot.unitId,
        originalRef: slot.originalRef,
        status: "unassigned" as const,
        confidence: 0,
        alternates,
        evidenceProvider: String(evidenceProvider),
        why:
          bestTaken && best && best.score >= MIN_ASSIGN_SCORE
            ? `UNASSIGNED: best visible match already assigned to another slot; refusing duplicate placement.`
            : best && best.score > 0
              ? `UNASSIGNED: best visible-evidence score ${best.score} is below threshold ${MIN_ASSIGN_SCORE}; refusing weak topical guess that the photo documents this event.`
              : `UNASSIGNED: no uploaded photo's visible content supports this story (provider=${evidenceProvider}).`,
      };
    }

    const margin = picked.score - (ranked.find((r) => r.image.id !== picked.imageId)?.score ?? 0);
    const confidence = Math.min(0.95, Math.max(0.55, 0.45 + picked.score * 0.08 + Math.max(0, margin) * 0.05));
    return {
      unitId: slot.unitId,
      originalRef: slot.originalRef,
      chosenImageId: picked.imageId,
      status: "assigned" as const,
      confidence,
      alternates: alternates.filter((a) => a.imageId !== picked.imageId).slice(0, 3),
      evidenceProvider: String(evidenceProvider),
      why: `Selected from visible image evidence (score ${picked.score}${picked.thematic.length ? `; themes: ${picked.thematic.join(", ")}` : ""}${picked.overlap.length ? `; terms: ${picked.overlap.join(", ")}` : ""}). Not a claim the photo documents a named real event.`,
    };
  });
}

/**
 * Back-compat single-article helper used by older tests. Prefer the global API.
 * Still refuses to assign without visible evidence and never uses filename aliases.
 */
export function assignUnresolvedPhotos(
  article: AssignmentArticle,
  refs: string[],
  images: NewsImage[],
  unavailableImageIds: Set<string> = new Set(),
): PhotoAssignment[] {
  const slots = refs.map((originalRef, i) => ({
    unitId: `local-${i}`,
    originalRef,
    article,
  }));
  return assignUnresolvedPhotosGlobally(slots, images, unavailableImageIds).map(({ unitId: _u, ...rest }) => rest);
}
