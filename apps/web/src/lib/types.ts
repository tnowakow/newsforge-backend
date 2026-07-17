// Lightweight client-side mirrors of the shared schema types.
// The canonical Zod schemas live in @newsforge/shared.
//
// v2 additions (Phase 3 · Maya): LayoutFitReport, ComplianceFlag,
// ApprovalState, BundleManifest, and the extended RunRecordV2 shape.
//
// NOTE (flag for John): the shared package's `.js` re-export layout doesn't
// resolve cleanly under Vite's default ESM inference for a plain workspace
// package without a build step (moduleResolution="bundler" alone isn't
// enough here since the source files use .js suffixes). Rather than force
// a build-step regression on Marcus's backend, Maya mirrors the shapes
// locally with the same field names / string unions as the Zod schemas.
// Any drift would surface via runtime shape mismatches on real API calls.

export type Richness = "SIMPLE" | "MODERATE" | "RICH" | "EXTRA_RICH";
export type FillerMode = "GENERATE" | "PLACEHOLDER";
export type RunStatus = "DRAFT" | "ASSEMBLING" | "READY" | "ERROR";

export interface ClientSummary {
  id: string;
  name: string;
  tagline?: string | null;
  richnessLevel: Richness;
  logoUrl?: string | null;
  primaryColor: string;
  pageCount: number;
  city?: string | null;
  state?: string | null;
}

export interface RecurringSection {
  id: string;
  title: string;
  slotHint: "headline" | "body" | "sidebar" | "calendar" | "spotlight";
  wordTarget: number;
  required: boolean;
  description?: string;
}

export interface BrandKit {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string | null;
}

export interface ClientFull extends ClientSummary {
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  brandVoice?: string | null;
  careLevel?: string | null;
  recurringSections: RecurringSection[];
  defaultTemplate?: TemplateRecord | null;
  templateId?: string | null;
}

export interface TemplateRecord {
  id: string;
  name: string;
  pageCount: number;
  description?: string | null;
  gridSpec?: unknown;
  compatibilityHints?: {
    richness?: Richness[];
    notes?: string;
  } | null;
}

export type ArticleType =
  | "resident-story"
  | "event-recap"
  | "announcement"
  | "birthday"
  | "executive-note"
  | "other";

export interface Article {
  id: string;
  title: string;
  body: string;
  wordCount: number;
  byline?: string;
  sectionId?: string;
  isFiller?: boolean;
  source?: "MOCK" | "UPLOAD" | "GENERATED";
  articleType?: ArticleType;
}

export interface NewsImage {
  id: string;
  url: string;
  caption?: string;
  alt?: string;
  aspect?: "square" | "portrait" | "landscape";
  isPlaceholder?: boolean;
  source?: "MOCK" | "UPLOAD" | "GENERATED";
}

export interface MockContentResult {
  articles: Article[];
  images: NewsImage[];
  counts: { articles: number; images: number };
}

export interface LayoutBlock {
  blockId: string;
  slotId: string;
  page: number;
  position: { col: number; row: number; colSpan: number; rowSpan: number };
  kind: "article" | "image" | "filler" | "placeholder" | "recurring" | "empty";
  articleId?: string;
  imageId?: string;
  inlineText?: string;
  sectionId?: string;
  needsFiller?: boolean;
  styleTag?: string;
}

export interface AssembledLayout {
  templateId: string;
  pageCount: number;
  blocks: LayoutBlock[];
  unfilledSlotIds?: string[];
  stats: {
    placedArticles: number;
    placedImages: number;
    fillerBlocks: number;
    emptySlots: number;
  };
  version: number;
}

// ---------------- v2 additions ----------------

/** Vitaly §3.1 — persisted on run.layoutFitReport (JSONB) */
export interface LayoutFitCandidate {
  templateId: string;
  score: number;
  subscores: {
    articleCount: number;
    photoCount: number;
    articleTypeMatch: number;
    avgWordDelta: number;
  };
}

export interface LayoutFitArticleFit {
  articleId: string;
  slotId: string;
  wordsIn: number;
  wordsOut: number;
  trimmed: boolean;
}

export interface LayoutFitPhotoFit {
  imageId: string;
  slotId?: string;
  dropped: boolean;
  reason?: "fit" | "photo-unused" | "photos-under-supplied";
}

export interface LayoutFitReport {
  chosenTemplateId: string;
  score: number;
  candidates: LayoutFitCandidate[];
  articleFit: LayoutFitArticleFit[];
  photoFit: LayoutFitPhotoFit[];
  emptySlots: string[];
  warnings: string[];
}

/** Vitaly §3.2 — one flag per detected compliance concern. */
export type ComplianceCategory =
  | "resident-last-name"
  | "full-birthdate-with-name"
  | "likely-stock-photo"
  | "last-name-in-image"
  | "low-dpi-image"; // sprint-log mid-sprint correction #3

export type ComplianceSeverity = "block" | "warn" | "info";

export type ComplianceTarget =
  | {
      kind: "article";
      articleId: string;
      offset?: number;
      match?: string;
    }
  | {
      kind: "image";
      imageId: string;
      bbox?: number[];
    };

export interface ComplianceFlag {
  id: string;
  category: ComplianceCategory;
  severity: ComplianceSeverity;
  target: ComplianceTarget;
  reason: string;
  detectorVersion: string;
  resolvedByUser?: boolean;
}

/**
 * Vitaly §3.4 — wire enum ("pending"/"approved"/"changes_requested")
 * from shared/schemas/approval.ts. The DB uses UPPER_CASE via Prisma;
 * Marcus's routes surface UPPER_CASE on the run record right now (see
 * §API-contract note below). Maya normalizes at the client boundary.
 *
 * API-contract note for John: Sofia's wireframes assume
 * `run.approval.approvalStatus` (nested object). Marcus's shipped runs
 * expose flat top-level fields (`approvalStatus`, `approvalNotes`,
 * `approvedAt`, `approvedBy`) — the Prisma-serialized row. Both spellings
 * mean the same thing; Maya reads flat and treats them as the source of
 * truth. If John/Marcus want to normalize later, a `run.approval` bag
 * would be a superset addition, not a breaking change.
 */
export type ApprovalStatusWire = "pending" | "approved" | "changes_requested";
export type ApprovalStatusDb = "PENDING" | "APPROVED" | "CHANGES_REQUESTED";

export interface ApprovalState {
  approvalStatus: ApprovalStatusWire;
  approvalNotes: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}

/** Vitaly §3.3 — inside every InDesign bundle .zip as layout.json */
export interface BundleBlock {
  blockId: string;
  slotId: string;
  page: number;
  kind: "article" | "image" | "filler" | "placeholder" | "recurring" | "empty";
  position: { col: number; row: number; colSpan: number; rowSpan: number };
  textFile?: string;
  imageFile?: string;
  styleTag?: string;
}

export interface BundleManifest {
  runId: string;
  clientId: string;
  clientName: string;
  templateId: string;
  templateName: string;
  monthLabel: string;
  layoutVersion: number;
  generatedAt: string;
  bleedInches: number;
  safeAreaInches: number;
  cropMarksEnabled: boolean;
  pageCount: number;
  blocks: BundleBlock[];
}

/**
 * Extended run shape (v2). All v1 fields are optional here to match what
 * Marcus's `include: { client, template }` include returns from Prisma.
 * v2-only fields are nullable so old runs deserialise safely.
 */
export interface RunRecord {
  id: string;
  clientId: string;
  templateId: string;
  monthLabel?: string | null;
  fillerMode: FillerMode;
  status?: RunStatus;
  layoutVersion: number;
  pdfUrl?: string | null;
  pdfPath?: string | null;
  pdfGeneratedAt?: string | null;
  assembledLayout: AssembledLayout;
  articles?: Article[];
  images?: NewsImage[];
  client?: ClientFull;
  template?: TemplateRecord;
  createdAt?: string;
  updatedAt?: string;

  // v2 fields, flat (matches Prisma serialization)
  approvalStatus?: ApprovalStatusDb | ApprovalStatusWire;
  approvalNotes?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  printPdfPath?: string | null;
  printPdfGeneratedAt?: string | null;
  layoutFitReport?: LayoutFitReport | null;
  complianceFlags?: ComplianceFlag[];
  bundleZipPath?: string | null;
  bundleBuiltAt?: string | null;
  bundleLayoutVersion?: number | null;
}

export interface UploadResult {
  files: Array<{
    id: string;
    kind: "image" | "article";
    url?: string;
    title?: string;
    body?: string;
    bytes?: number;
    originalName?: string;
  }>;
}

// ---------------- Helpers ----------------

/** Normalize any approval-status representation to the wire form. */
export function normalizeApprovalStatus(
  s: string | null | undefined,
): ApprovalStatusWire {
  if (!s) return "pending";
  const lower = s.toLowerCase();
  if (lower === "approved") return "approved";
  if (lower === "changes_requested" || lower === "changes-requested")
    return "changes_requested";
  return "pending";
}
