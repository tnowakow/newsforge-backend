import {
  legacyProvenanceToCanonical,
  type AssetCaption,
  type AssetDecisionRecord,
  type AssetLinkRecord,
  type AssetProvenance,
  type AssetReservation,
  type AliasRecord,
  type SourceAssetContract,
  SourceAssetContractSchema,
} from "@newsforge/shared/schemas";
import type { NewsImage } from "@newsforge/shared/schemas";
import type { ParsedPorterSubmission } from "./uploadService.js";
import { normalizePorterFilename } from "./porterSourceSemantics.js";
import { assignUnresolvedPhotosGlobally, type PhotoAssignment } from "./photoAssignment.js";

export type SourcePlacement = "inner" | "outer" | "unresolved";
/**
 * Legacy 5-value status kept for stored-run compatibility.
 * `provenance` (shared AssetProvenance) is the canonical value per the TRI-R04 contract.
 */
export type PhotoLinkStatus = "exact" | "operator-confirmed" | "semantic-assigned" | "unresolved" | "ambiguous";
export type PhotoLink = {
  /** Operator's original wording, preserved for audit. */
  originalRef: string;
  imageId?: string;
  status: PhotoLinkStatus;
  /** Canonical provenance per the shared source/asset contract (TRI-R04). */
  provenance: AssetProvenance;
  /** Operator alias that produced this resolution, if any. */
  alias?: string;
  /** Supplied caption attached to this link's asset (never generated from headings). */
  caption?: string;
};
export type SourceUnit = {
  /** Canonical source-unit ID (stable, lossless). */
  id: string;
  sourceParagraphIds: string[];
  role: string;
  originalText: string;
  required: boolean;
  placement: SourcePlacement;
  photoLinks: PhotoLink[];
  /** Recorded reason required when this unit (or one of its assets) is explicitly rejected. */
  rejectionReason?: string;
  /** Semantic fallback decisions for unresolved filename references. */
  photoAssignments?: PhotoAssignment[];
};
export type SourceManifest = {
  sourceFilename?: string;
  sourceParagraphs: Array<{ id: string; originalText: string; order: number }>;
  units: SourceUnit[];
  unassignedImageIds: string[];
  warnings: string[];
  /** Operator alias → image ID mappings (real link records, not ref substitution). */
  aliases: AliasRecord[];
  /** Supplied captions, attached to asset IDs. */
  captions: AssetCaption[];
  /** Images reserved by exact/operator-confirmed links; excluded from later inferred matching. */
  reservations: AssetReservation[];
};

export type SourceManifestInput = {
  sourceFilename?: string;
  sourceText?: string;
  parsed: ParsedPorterSubmission;
  images?: NewsImage[];
  /**
   * Operator aliases: original ref (as written in the source) → target image ID
   * or target filename. Real link records per the TRI-R04 contract.
   */
  operatorAliases?: Record<string, string>;
  /** Supplied captions keyed by filename (from the source document's caption list). */
  captions?: Record<string, string>;
};

function sourceParagraphs(text: string | undefined) {
  return (text ?? "").replace(/\r\n/g, "\n").split(/\n+/)
    .map((originalText, order) => ({ id: `paragraph-${String(order + 1).padStart(4, "0")}`, originalText, order }))
    .filter((paragraph) => paragraph.originalText.trim().length > 0);
}

function imageName(image: NewsImage): string | undefined {
  return (image as NewsImage & { originalName?: string }).originalName ?? image.url.split(/[\\/]/).pop();
}

function findImageByName(images: NewsImage[], name: string): NewsImage | undefined {
  return images.find((image) => (imageName(image) ?? "").trim() === name.trim());
}

/**
 * Resolve an operator alias value to a concrete image.
 * Accepts either a target image ID or a target filename.
 */
function resolveAliasTarget(images: NewsImage[], aliasValue: string): NewsImage | undefined {
  const byId = images.find((image) => image.id === aliasValue);
  if (byId) return byId;
  const byName = findImageByName(images, aliasValue);
  if (byName) return byName;
  const normalized = normalizePorterFilename(aliasValue);
  return images.find((image) => normalizePorterFilename(imageName(image) ?? "") === normalized);
}

function captionForImage(captions: Record<string, string> | undefined, image: NewsImage, originalRef: string): string | undefined {
  if (!captions) return undefined;
  const name = imageName(image);
  if (name && captions[name]) return captions[name];
  if (originalRef && captions[originalRef]) return captions[originalRef];
  if (name) {
    const normalized = normalizePorterFilename(name);
    const hit = Object.entries(captions).find(([key]) => normalizePorterFilename(key) === normalized);
    if (hit?.[1]) return hit[1];
  }
  return undefined;
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
  const aliases: AliasRecord[] = [];
  const captions: AssetCaption[] = [];
  const reservations: AssetReservation[] = [];
  const seenAlias = new Set<string>();
  const seenCaption = new Set<string>();
  const seenReservation = new Set<string>();

  const recordAlias = (alias: string, imageId: string) => {
    if (seenAlias.has(`${alias}\u0000${imageId}`)) return;
    seenAlias.add(`${alias}\u0000${imageId}`);
    aliases.push({ alias, targetImageId: imageId });
  };
  const recordCaption = (assetId: string, text: string) => {
    if (seenCaption.has(assetId)) return;
    seenCaption.add(assetId);
    captions.push({ assetId, text, source: "supplied" });
  };
  const recordReservation = (image: NewsImage, unitId: string, originalRef: string, reason: "exact" | "operator-confirmed") => {
    const key = `${image.id}\u0000${unitId}`;
    if (seenReservation.has(key)) return;
    seenReservation.add(key);
    reservations.push({ imageId: image.id, reservedByUnitId: unitId, originalRef, reason });
  };

  const articles = input.parsed.articles;
  // Pass 1 — exact / operator-confirmed only. Reserve across the whole packet
  // before any inferred matching so later exact links cannot be stolen.
  type DraftUnit = {
    id: string;
    index: number;
    article: (typeof articles)[number];
    photoLinks: PhotoLink[];
  };
  const drafts: DraftUnit[] = [];
  for (const [index, article] of articles.entries()) {
    const unitId = `source-unit-${String(index + 1).padStart(4, "0")}`;
    const refs = article.imageRefs ?? [];
    const photoLinks: PhotoLink[] = refs.map((originalRef) => {
      const alias = input.operatorAliases?.[originalRef];
      const targetName = alias ?? originalRef;
      const matches = byName.get(normalizePorterFilename(targetName)) ?? [];
      const caption = (match: NewsImage) => captionForImage(input.captions, match, originalRef);

      if (alias) {
        const target = resolveAliasTarget(images, alias);
        if (target) {
          // Exact/confirmed links may share an image across units; inferred matching cannot.
          used.add(target.id);
          const linkCaption = caption(target);
          recordAlias(originalRef, target.id);
          if (linkCaption) recordCaption(target.id, linkCaption);
          recordReservation(target, unitId, originalRef, "operator-confirmed");
          return { originalRef, imageId: target.id, status: "operator-confirmed" as const, provenance: "operator-confirmed" as const, alias, caption: linkCaption };
        }
        warnings.push(`unresolved-alias:${originalRef}`);
        return { originalRef, status: "unresolved" as const, provenance: "unresolved" as const, alias };
      }

      if (matches.length > 1) return { originalRef, status: "ambiguous" as const, provenance: "unresolved" as const };
      if (matches.length === 1) {
        const match = matches[0]!;
        // Multiple exact refs may legitimately point at the same uploaded file.
        // Mark reserved so later inferred matching cannot steal it.
        used.add(match.id);
        const linkCaption = caption(match);
        if (linkCaption) recordCaption(match.id, linkCaption);
        recordReservation(match, unitId, originalRef, "exact");
        return { originalRef, imageId: match.id, status: "exact" as const, provenance: "exact" as const, caption: linkCaption };
      }
      warnings.push(`unresolved-photo:${originalRef}`);
      return { originalRef, status: "unresolved" as const, provenance: "unresolved" as const };
    });
    drafts.push({ id: unitId, index, article, photoLinks });
  }

  // Pass 2 — global visible-evidence ranking for remaining unresolved refs.
  const slots = drafts.flatMap((draft) =>
    draft.photoLinks
      .filter((link) => link.status === "unresolved")
      .map((link) => ({
        unitId: draft.id,
        originalRef: link.originalRef,
        article: { title: draft.article.title, body: draft.article.body },
      })),
  );
  const globalAssignments = slots.length
    ? assignUnresolvedPhotosGlobally(slots, images, used)
    : [];
  const assignmentsByUnit = new Map<string, PhotoAssignment[]>();
  for (const assignment of globalAssignments) {
    const unitId = assignment.unitId ?? "";
    const list = assignmentsByUnit.get(unitId) ?? [];
    list.push(assignment);
    assignmentsByUnit.set(unitId, list);
    if (assignment.chosenImageId) {
      used.add(assignment.chosenImageId);
      const draft = drafts.find((d) => d.id === unitId);
      const link = draft?.photoLinks.find((candidate) => candidate.originalRef === assignment.originalRef);
      if (link) {
        link.imageId = assignment.chosenImageId;
        link.status = "semantic-assigned";
        link.provenance = "inferred";
      }
    } else if (assignment.status === "ambiguous") {
      const draft = drafts.find((d) => d.id === unitId);
      const link = draft?.photoLinks.find((candidate) => candidate.originalRef === assignment.originalRef);
      if (link) {
        link.status = "ambiguous";
        link.provenance = "unresolved";
      }
    }
  }

  for (const draft of drafts) {
    const photoAssignments = assignmentsByUnit.get(draft.id) ?? [];
    units.push({
      id: draft.id,
      sourceParagraphIds: [paragraphs[draft.index]?.id ?? `paragraph-${String(draft.index + 1).padStart(4, "0")}`],
      role: draft.article.sectionId ?? draft.article.articleType ?? "article",
      originalText: draft.article.body,
      required: true,
      placement: "inner",
      photoLinks: draft.photoLinks,
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
  return {
    sourceFilename: input.sourceFilename,
    sourceParagraphs: paragraphs,
    units,
    unassignedImageIds,
    warnings: [...new Set(warnings)],
    aliases,
    captions,
    reservations,
  };
}

export function sourceUnitFullyResolved(unit: SourceUnit): boolean {
  // A semantic (inferred) assignment is a suggestion, not a confirmation —
  // every link must be exact or operator-confirmed for the unit to count
  // as fully resolved.
  return unit.photoLinks.every((link) => link.status === "exact" || link.status === "operator-confirmed");
}

/**
 * Build the reserved-ownership guard for the layout planners (TRI-R04).
 *
 * From the canonical shared contract, map every reserved image ID
 * (exact / operator-confirmed reservation) to the image refs the owning
 * unit used to claim it. A layout pairing may only hand out a reserved
 * image to the article that actually references it — never to an
 * unrelated article as a fallback fill.
 *
 * Article matching is by the unit's own original refs (the planner's
 * article.imageRefs are the same parsed refs the manifest was built
 * from); a text-overlap fallback covers articles whose refs were
 * stripped or trimmed upstream. Returns undefined when there is nothing
 * to guard (no contract, no reservations) so callers keep the legacy
 * behavior unchanged for non-Porter runs.
 */
export function reservedImageOwnerRefsFromContract(
  contract: SourceAssetContract | null | undefined,
  articles: Array<{ id: string; imageRefs?: string[] }>,
): Map<string, string[]> | undefined {
  const reservations = contract?.reservations;
  if (!reservations?.length) return undefined;
  const units = contract?.units ?? [];
  const guard = new Map<string, string[]>();
  for (const reservation of reservations) {
    if (guard.has(reservation.imageId)) continue;
    const unit = units.find((candidate) => candidate.id === reservation.reservedByUnitId);
    const refs = (unit?.links ?? [])
      .filter((link) => link.originalRef === reservation.originalRef || link.resolvedImageId === reservation.imageId)
      .map((link) => link.originalRef)
      .filter((ref): ref is string => Boolean(ref));
    guard.set(reservation.imageId, refs);
  }
  const unitForArticle = (article: { imageRefs?: string[] }) => {
    const refs = article.imageRefs ?? [];
    if (!refs.length) return undefined;
    let unit = units.find((candidate) => {
      const unitRefs = (candidate.links ?? []).map((link) => link.originalRef);
      return refs.some((ref) => unitRefs.includes(ref));
    });
    if (!unit) {
      unit = units.find((candidate) => {
        const candidateText = (candidate.links ?? []).map((link) => link.originalRef).join(" ");
        if (!candidateText) return false;
        return candidateText.split(/\s+/).some((token) => refs.some((ref) => ref.includes(token) || token.includes(ref)));
      });
    }
    return unit;
  };
  for (const article of articles) {
    const unit = unitForArticle(article);
    if (!unit) continue;
    for (const link of unit.links ?? []) {
      if (link.resolvedImageId && guard.has(link.resolvedImageId)) {
        const refs = guard.get(link.resolvedImageId) ?? [];
        const articleRefs = article.imageRefs ?? [];
        for (const ref of articleRefs) {
          if (!refs.includes(ref)) refs.push(ref);
        }
        guard.set(link.resolvedImageId, refs);
      }
    }
  }
  return guard.size ? guard : undefined;
}

/**
 * Project a manifest onto the canonical shared SourceAssetContract (TRI-R04).
 * The result is zod-validated so downstream tasks can trust its shape.
 */
export function toSourceAssetContract(manifest: SourceManifest): SourceAssetContract {
  const links: AssetLinkRecord[] = manifest.units.flatMap((unit) =>
    unit.photoLinks.map((link) => ({
      originalRef: link.originalRef,
      resolvedImageId: link.imageId,
      provenance: link.provenance,
      ...(link.alias ? { alias: link.alias } : {}),
      ...(link.caption ? { caption: link.caption } : {}),
    })),
  );
  // TRI-R04 item 4 — project each source unit's manifest placement into a
  // per-asset decision record. Rejected/unresolved units carry their
  // recorded reason so layout decisions remain traceable to the contract.
  const assetDecisions: AssetDecisionRecord[] = manifest.units.flatMap((unit) => {
    const kind: AssetDecisionRecord["kind"] = unit.role === "birthday-roster" ? "roster" : unit.role === "dated-list" ? "schedule" : "article";
    const base = { assetId: unit.id, unitId: unit.id, kind, required: unit.required };
    const photoDecision = (link: PhotoLink, unitOutcome: "placed" | "rejected" | "unresolved"): AssetDecisionRecord => ({
      assetId: link.imageId ?? link.originalRef,
      unitId: unit.id,
      kind: "photo",
      outcome: link.imageId ? unitOutcome : "unresolved",
      reason: link.imageId
        ? (unitOutcome === "placed" ? "photo allocated with its source unit to inner pages 2\u20133" : unit.rejectionReason ?? "photo rejected with its source unit")
        : "photo reference unresolved: no uploaded image matched the operator's original ref",
      required: unit.required,
      decisionCode: unitOutcome === "placed" ? "manifest-inner-photo" : unitOutcome === "rejected" ? "manifest-photo-rejected" : "manifest-photo-unresolved",
    });
    if (unit.placement === "inner") {
      return [
        { ...base, outcome: "placed" as const, reason: "allocated to inner pages 2\u20133 by source manifest", decisionCode: "manifest-inner-alloc" },
        ...unit.photoLinks.map((link) => photoDecision(link, "placed")),
      ];
    }
    if (unit.placement === "unresolved") {
      return [
        { ...base, outcome: "unresolved" as const, reason: unit.rejectionReason ?? "unit placement not yet resolved by the layout pipeline", decisionCode: "manifest-unresolved" },
        ...unit.photoLinks.map((link) => photoDecision(link, "unresolved")),
      ];
    }
    return [
      { ...base, outcome: "rejected" as const, reason: unit.rejectionReason ?? "source unit explicitly not allocated to inner pages 2\u20133", decisionCode: "manifest-rejected" },
      ...unit.photoLinks.map((link) => photoDecision(link, "rejected")),
    ];
  });
  const contract: SourceAssetContract = {
    version: 1,
    ...(manifest.sourceFilename ? { sourceFilename: manifest.sourceFilename } : {}),
    sourceParagraphs: manifest.sourceParagraphs,
    units: manifest.units.map((unit) => ({
      id: unit.id,
      role: (["director-note", "birthday-roster", "dated-list", "profile-story", "narrative-story", "brief"] as const).includes(unit.role as never)
        ? (unit.role as never)
        : "brief",
      placement: unit.placement,
      sourceParagraphIds: unit.sourceParagraphIds,
      originalText: unit.originalText,
      required: unit.required,
      links: unit.photoLinks.map((link) => ({
        originalRef: link.originalRef,
        resolvedImageId: link.imageId,
        provenance: link.provenance,
        ...(link.alias ? { alias: link.alias } : {}),
        ...(link.caption ? { caption: link.caption } : {}),
        ...(unit.rejectionReason ? { rejectionReason: unit.rejectionReason } : {}),
      })),
      ...(unit.rejectionReason ? { rejectionReason: unit.rejectionReason } : {}),
    })),
    links,
    reservations: manifest.reservations,
    aliases: manifest.aliases,
    captions: manifest.captions,
    unassignedImageIds: manifest.unassignedImageIds,
    assetDecisions,
    warnings: manifest.warnings,
  };
  // Self-check: the projection must satisfy the canonical schema.
  const parsed = SourceAssetContractSchema.safeParse(contract);
  if (!parsed.success) {
    throw new Error(`SourceAssetContract validation failed: ${parsed.error.issues.map((issue: { message: string }) => issue.message).join("; ")}`);
  }
  return parsed.data;
}
