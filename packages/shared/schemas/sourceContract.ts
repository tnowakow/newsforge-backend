/**
 * TRI-R04 — Shared source & asset contract.
 *
 * This is the single canonical type surface for all downstream R04 tasks
 * (t_553c728e, t_2490212f, t_ab444658).  Import from here, not from
 * local service types.
 *
 * Existing outer pages (1 and 4) are fixed by convention; this contract
 * governs inner-spread (pages 2–3) placement only.
 */
import { z } from "zod";

// ── Source roles ────────────────────────────────────────────────────

export const PorterSourceRoleSchema = z.enum([
  "director-note",
  "birthday-roster",
  "dated-list",
  "profile-story",
  "narrative-story",
  "brief",
]);
export type PorterSourceRole = z.infer<typeof PorterSourceRoleSchema>;

// ── Provenance ──────────────────────────────────────────────────────
//
// Four canonical values per the TRI-R04 plan.
// Legacy 5-value enum (exact | operator-confirmed | semantic-assigned |
// unresolved | ambiguous) maps to these via legacyProvenanceToCanonical().

export const AssetProvenanceSchema = z.enum([
  "exact",             // resolved by exact filename / ID match
  "operator-confirmed",// resolved by explicit operator alias
  "inferred",          // resolved by semantic / inferred matching (R05 scope)
  "unresolved",        // no match; remains unassigned
]);
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;

// ── Placement ───────────────────────────────────────────────────────

export const SourceUnitPlacementSchema = z.enum(["inner", "outer", "unresolved"]);
export type SourceUnitPlacement = z.infer<typeof SourceUnitPlacementSchema>;

// ── Alias record ────────────────────────────────────────────────────
//
// A named mapping the operator supplied: "use this image for that reference".
// The alias text is the operator's own wording (e.g. "Photo 1.jpg");
// targetImageId is the resolved image ID.

export const AliasRecordSchema = z.object({
  alias: z.string(),
  targetImageId: z.string(),
});
export type AliasRecord = z.infer<typeof AliasRecordSchema>;

// ── Caption record ──────────────────────────────────────────────────
//
// Captions are attached to an asset ID, not to a story heading.
// `source` distinguishes operator-supplied text from AI-generated text so
// downstream tasks never silently substitute one for the other.

export const AssetCaptionSchema = z.object({
  assetId: z.string(),
  text: z.string(),
  source: z.enum(["supplied", "generated"]).default("supplied"),
});
export type AssetCaption = z.infer<typeof AssetCaptionSchema>;

// ── Link record ─────────────────────────────────────────────────────
//
// A "real link record" — replaces the legacy ref→imageId substitution.
// `originalRef` is the operator's exact wording, preserved for audit.
// `resolvedImageId` is the canonical image ID after resolution.

export const AssetLinkRecordSchema = z.object({
  originalRef: z.string(),
  resolvedImageId: z.string().optional(),
  provenance: AssetProvenanceSchema,
  /** The operator alias that produced this resolution, if any. */
  alias: z.string().optional(),
  /** The caption attached to this link (supplied, not generated). */
  caption: z.string().optional(),
  /** Recorded when a link could not be resolved or was explicitly rejected. */
  rejectionReason: z.string().optional(),
});
export type AssetLinkRecord = z.infer<typeof AssetLinkRecordSchema>;

// ── Reservation ─────────────────────────────────────────────────────
//
// Once an image is reserved by an exact or operator-confirmed link it is
// excluded from all subsequent semantic / inferred matching for other units.
// This prevents one story from stealing an exact match needed later.

export const AssetReservationSchema = z.object({
  imageId: z.string(),
  reservedByUnitId: z.string(),
  originalRef: z.string(),
  reason: z.enum(["exact", "operator-confirmed"]),
});
export type AssetReservation = z.infer<typeof AssetReservationSchema>;

// ── Source paragraph ────────────────────────────────────────────────

export const SourceParagraphSchema = z.object({
  id: z.string(),
  originalText: z.string(),
  order: z.number().int().nonnegative(),
});
export type SourceParagraph = z.infer<typeof SourceParagraphSchema>;

// ── Source unit ─────────────────────────────────────────────────────
//
// The canonical unit of placement: one story, one roster, or one dated list.
// `id` is the stable canonical source-unit ID (e.g. "source-unit-0001").

export const SourceUnitContractSchema = z.object({
  id: z.string(),
  role: PorterSourceRoleSchema,
  /** "inner" = pages 2–3, "outer" = pages 1/4, "unresolved" = not yet decided. */
  placement: SourceUnitPlacementSchema,
  /** Paragraph IDs that belong to this unit (lossless tracking). */
  sourceParagraphIds: z.array(z.string()).default([]),
  /** Original source text, preserved for audit. */
  originalText: z.string(),
  /** Whether this unit must appear in the final output. */
  required: z.boolean().default(true),
  /** All image links associated with this unit. */
  links: z.array(AssetLinkRecordSchema).default([]),
  /** Required when any asset linked to this unit is explicitly rejected. */
  rejectionReason: z.string().optional(),
});
export type SourceUnitContract = z.infer<typeof SourceUnitContractSchema>;

// ── Top-level contract ──────────────────────────────────────────────
//
// The complete, self-describing source-and-asset state for one run.
// All downstream tasks should read and write through this type.

export const SourceAssetContractSchema = z.object({
  /** Schema version for forward compatibility. */
  version: z.number().int().min(1).default(1),
  sourceFilename: z.string().optional(),
  sourceParagraphs: z.array(SourceParagraphSchema).default([]),
  units: z.array(SourceUnitContractSchema).default([]),
  /** Flat list of all link records (for O(1) lookup by imageId or originalRef). */
  links: z.array(AssetLinkRecordSchema).default([]),
  /** All image reservations — these images are excluded from inferred matching. */
  reservations: z.array(AssetReservationSchema).default([]),
  /** Operator alias → image ID mappings. */
  aliases: z.array(AliasRecordSchema).default([]),
  /** All captions, keyed by asset ID. */
  captions: z.array(AssetCaptionSchema).default([]),
  /** Image IDs not claimed by any unit. */
  unassignedImageIds: z.array(z.string()).default([]),
  /** Warnings generated during contract construction. */
  warnings: z.array(z.string()).default([]),
});
export type SourceAssetContract = z.infer<typeof SourceAssetContractSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * True when every link in the unit has been resolved
 * (i.e. no link has provenance "unresolved").
 */
export function isUnitFullyResolved(unit: SourceUnitContract): boolean {
  return unit.links.every((link) => link.provenance !== "unresolved");
}

/**
 * Map a legacy PhotoLinkStatus value to the canonical AssetProvenance.
 *
 *   exact              → exact
 *   operator-confirmed → operator-confirmed
 *   semantic-assigned  → inferred
 *   unresolved         → unresolved
 *   ambiguous          → unresolved
 */
export function legacyProvenanceToCanonical(legacy: string): AssetProvenance {
  switch (legacy) {
    case "exact":
      return "exact";
    case "operator-confirmed":
      return "operator-confirmed";
    case "semantic-assigned":
      return "inferred";
    default:
      return "unresolved";
  }
}

/**
 * Build the set of image IDs that are reserved (exact or operator-confirmed)
 * and therefore excluded from any subsequent inferred matching pass.
 */
export function reservedImageIds(reservations: AssetReservation[]): Set<string> {
  return new Set(reservations.map((r) => r.imageId));
}
