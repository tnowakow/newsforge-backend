import type { NewsImage } from "@newsforge/shared/schemas";
import type { ParsedPorterSubmission } from "./uploadService.js";
import { normalizePorterFilename } from "./porterSourceSemantics.js";
import { assignUnresolvedPhotos, type PhotoAssignment } from "./photoAssignment.js";

export type SourcePlacement = "inner" | "outer" | "unresolved";
export type PhotoLinkStatus = "exact" | "operator-confirmed" | "semantic-assigned" | "unresolved" | "ambiguous";
export type PhotoLink = {
  originalRef: string;
  imageId?: string;
  status: PhotoLinkStatus;
};
export type SourceUnit = {
  id: string;
  sourceParagraphIds: string[];
  role: string;
  originalText: string;
  required: boolean;
  placement: SourcePlacement;
  photoLinks: PhotoLink[];
  /** Semantic fallback decisions for unresolved filename references. */
  photoAssignments?: PhotoAssignment[];
};
export type SourceManifest = {
  sourceFilename?: string;
  sourceParagraphs: Array<{ id: string; originalText: string; order: number }>;
  units: SourceUnit[];
  unassignedImageIds: string[];
  warnings: string[];
};

export type SourceManifestInput = {
  sourceFilename?: string;
  sourceText?: string;
  parsed: ParsedPorterSubmission;
  images?: NewsImage[];
  operatorAliases?: Record<string, string>;
};

function sourceParagraphs(text: string | undefined) {
  return (text ?? "").replace(/\r\n/g, "\n").split(/\n+/)
    .map((originalText, order) => ({ id: `paragraph-${String(order + 1).padStart(4, "0")}`, originalText, order }))
    .filter((paragraph) => paragraph.originalText.trim().length > 0);
}

function imageName(image: NewsImage): string | undefined {
  return (image as NewsImage & { originalName?: string }).originalName ?? image.url.split(/[\\/]/).pop();
}

/** Build an auditable, deterministic source-to-asset relationship manifest. */
export function buildSourceManifest(input: SourceManifestInput): SourceManifest {
  const images = input.images ?? [];
  const paragraphs = sourceParagraphs(input.sourceText);
  const byName = new Map<string, NewsImage[]>();
  for (const image of images) {
    const normalized = normalizePorterFilename(imageName(image) ?? "");
    if (normalized) byName.set(normalized, [...(byName.get(normalized) ?? []), image]);
  }
  const used = new Set<string>();
  const warnings = [...input.parsed.warnings];
  const units: SourceUnit[] = [];
  const articles = input.parsed.articles;
  for (const [index, article] of articles.entries()) {
    const refs = article.imageRefs ?? [];
    const photoLinks: PhotoLink[] = refs.map((originalRef) => {
      const alias = input.operatorAliases?.[originalRef];
      const targetName = alias ?? originalRef;
      const matches = byName.get(normalizePorterFilename(targetName)) ?? [];
      if (matches.length > 1) return { originalRef, status: "ambiguous" };
      if (matches.length === 1) {
        used.add(matches[0]!.id);
        return { originalRef, imageId: matches[0]!.id, status: alias ? "operator-confirmed" : "exact" };
      }
      warnings.push(`unresolved-photo:${originalRef}`);
      return { originalRef, status: "unresolved" };
    });
    const unresolvedRefs = photoLinks.filter((link) => link.status === "unresolved").map((link) => link.originalRef);
    const photoAssignments = unresolvedRefs.length
      ? assignUnresolvedPhotos(article, unresolvedRefs, images, used)
      : [];
    for (const assignment of photoAssignments) {
      if (assignment.chosenImageId) {
        used.add(assignment.chosenImageId);
        const link = photoLinks.find((candidate) => candidate.originalRef === assignment.originalRef);
        if (link) {
          link.imageId = assignment.chosenImageId;
          link.status = "semantic-assigned";
        }
      }
    }
    units.push({
      id: `source-unit-${String(index + 1).padStart(4, "0")}`,
      sourceParagraphIds: [paragraphs[index]?.id ?? `paragraph-${String(index + 1).padStart(4, "0")}`],
      role: article.sectionId ?? article.articleType ?? "article",
      originalText: article.body,
      required: true,
      placement: "inner",
      photoLinks,
      ...(photoAssignments.length ? { photoAssignments } : {}),
    });
  }
  for (const [index, list] of input.parsed.lists.entries()) {
    const originalText = `${list.label}: ${list.rows.map((row) => `${row.value} ${row.label}`).join("; ")}`;
    units.push({
      id: `source-unit-list-${String(index + 1).padStart(4, "0")}`,
      sourceParagraphIds: [paragraphs[articles.length + index]?.id ?? `paragraph-list-${index + 1}`],
      role: list.panelRole,
      originalText,
      required: true,
      placement: "inner",
      photoLinks: [],
    });
  }
  const unassignedImageIds = images.filter((image) => !used.has(image.id)).map((image) => image.id);
  if (unassignedImageIds.length) warnings.push(`unassigned-images:${unassignedImageIds.length}`);
  return { sourceFilename: input.sourceFilename, sourceParagraphs: paragraphs, units, unassignedImageIds, warnings: [...new Set(warnings)] };
}

export function sourceUnitFullyResolved(unit: SourceUnit): boolean {
  return unit.photoLinks.every((link) => link.status === "exact" || link.status === "operator-confirmed" || link.status === "semantic-assigned");
}
