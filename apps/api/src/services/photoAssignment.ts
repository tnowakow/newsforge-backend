import type { NewsImage } from "@newsforge/shared/schemas";

export type PhotoAssignmentAlternative = {
  imageId: string;
  score: number;
  why: string;
};

export type PhotoAssignment = {
  originalRef: string;
  chosenImageId?: string;
  status: "assigned" | "unassigned";
  confidence: number;
  why: string;
  alternates: PhotoAssignmentAlternative[];
};

type AssignmentArticle = { title: string; body: string };

const STOP_WORDS = new Set("a an and are as at be by for from in is it of on or that the their this to with our your you we".split(" "));
const TOKEN_ALIASES: Record<string, string[]> = {
  chef: ["food", "meal", "dining", "culinary", "restaurant", "fork"],
  circle: ["group", "community"],
  legacy: ["veteran", "military", "service", "war", "air force", "wwii", "korea", "vietnam"],
  anniversary: ["celebration", "birthday", "milestone", "years"],
  campus: ["community", "resident", "residents", "activity"],
  family: ["family", "grandparent", "child", "multigenerational"],
  people: ["people", "resident", "couple", "seniors"],
};

function tokens(value: string): Set<string> {
  const result = new Set<string>();
  for (const token of value.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (token.length > 2 && !STOP_WORDS.has(token)) result.add(token);
  }
  return result;
}

function semanticText(image: NewsImage): string {
  const candidate = image as NewsImage & { semanticText?: string; originalName?: string };
  // originalName is deliberately excluded: filenames are not evidence of image content.
  return [image.description, image.alt, image.caption, ...(image.tags ?? []), candidate.semanticText].filter(Boolean).join(" ");
}

function score(article: AssignmentArticle, image: NewsImage): { score: number; overlap: string[] } {
  const articleTokens = tokens(`${article.title} ${article.body}`);
  const imageTokens = tokens(semanticText(image));
  const expanded = new Set(articleTokens);
  for (const token of articleTokens) for (const alias of TOKEN_ALIASES[token] ?? []) expanded.add(alias);
  const overlap = [...expanded].filter((token) => imageTokens.has(token)).sort();
  return { score: overlap.length, overlap };
}

/**
 * Deterministic, auditable assignment for refs that did not resolve by filename.
 * It only treats semantic metadata (description, alt, caption, tags) as evidence;
 * an opaque upload therefore remains visibly unassigned rather than filename-matched.
 */
export function assignUnresolvedPhotos(
  article: AssignmentArticle,
  refs: string[],
  images: NewsImage[],
  unavailableImageIds: Set<string> = new Set(),
): PhotoAssignment[] {
  const available = images.filter((image) => !unavailableImageIds.has(image.id));
  const remaining = new Set(available.map((image) => image.id));
  return refs.map((originalRef) => {
    const ranked = available.filter((image) => remaining.has(image.id)).map((image) => ({ image, ...score(article, image) }))
      .sort((a, b) => b.score - a.score || a.image.id.localeCompare(b.image.id));
    const top = ranked[0];
    const alternatives = ranked.slice(1, 4).map(({ image, score: value }) => ({
      imageId: image.id,
      score: value,
      why: value > 0 ? "shared semantic terms, but less evidence than the selected photo" : "no semantic evidence in the uploaded photo metadata",
    }));
    if (!top || top.score === 0) return {
      originalRef, status: "unassigned", confidence: 0, alternates: alternatives,
      why: "UNASSIGNED: no uploaded photo exposed semantic evidence for this article; filename matching was intentionally not used.",
    };
    const margin = top.score - (ranked[1]?.score ?? 0);
    remaining.delete(top.image.id);
    const confidence = Math.min(0.99, Math.max(0.5, 0.5 + top.score * 0.1 + margin * 0.1));
    return {
      originalRef, chosenImageId: top.image.id, status: "assigned", confidence,
      alternates: alternatives,
      why: `Selected from semantic overlap (${top.overlap.join(", ")}); confidence reflects score ${top.score} and margin ${margin}.`,
    };
  });
}
