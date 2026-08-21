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
  imageRefs?: string[];
  isFiller?: boolean;
  source?: "MOCK" | "UPLOAD" | "GENERATED";
  articleType?: ArticleType;
  sourceRole?: "director-note" | "birthday-roster" | "dated-list" | "profile-story" | "narrative-story" | "brief";
  sourceOrder?: number;
  compoundId?: string;
}

export interface NewsImage {
  id: string;
  url: string;
  caption?: string;
  alt?: string;
  description?: string;
  tags?: string[];
  aspect?: "square" | "portrait" | "landscape";
  focalX?: number;
  focalY?: number;
  zoom?: number;
  fitMode?: "cover" | "contain" | "fill";
  isPlaceholder?: boolean;
  source?: "MOCK" | "UPLOAD" | "GENERATED" | "STOCK";
}

export interface MockContentResult {
  articles: Article[];
  images: NewsImage[];
  counts: { articles: number; images: number };
  scenario?: string;
  audit?: AiPromptAuditMeta & {
    kind: "generation-content";
    prompt: string;
  };
}

export type PanelToken =
  | "primary" | "secondary" | "accent" | "sun" | "navy" | "coral"
  | "sky" | "berry" | "leaf" | "blush" | "cream" | "paper";

export interface BlockStyle {
  bg?: PanelToken;
  headerColor?: PanelToken;
  invertText?: boolean;
  cornerRadius?: number;
  scriptHeading?: boolean;
  centered?: boolean;
  panelRole?:
    | "birthday"
    | "directorCorner"
    | "happyHour"
    | "upcomingEvents"
    | "outingList"
    | "spotlightRail"
    | "featureBand"
    | "volunteerCallout"
    | "infoFooter"
    | "photoCluster";
  photoTreatment?: "rounded" | "collage" | "stacked" | "wide" | "portrait";
  compact?: boolean;
}

export type VisualPersonality =
  | "classic-community"
  | "garden-warmth"
  | "photo-journal"
  | "resident-spotlight"
  | "editorial-calm"
  | "celebration-pop";

export interface ListItem {
  label: string;
  value?: string;
  isGroupHeader?: boolean;
}

export interface LayoutBlock {
  blockId: string;
  slotId: string;
  page: number;
  position: { col: number; row: number; colSpan: number; rowSpan: number };
  kind: "article" | "image" | "filler" | "placeholder" | "recurring" | "empty" | "list";
  articleId?: string;
  imageId?: string;
  inlineText?: string;
  sectionId?: string;
  needsFiller?: boolean;
  styleTag?: string;
  zIndex?: number;
  /** v3 — visual styling (mirrors @newsforge/shared blockStyle.ts). */
  style?: BlockStyle;
  heading?: string;
  caption?: string;
  listItems?: ListItem[];
  sourceRole?: "director-note" | "birthday-roster" | "dated-list" | "profile-story" | "narrative-story" | "brief";
  sourceOrder?: number;
  compoundId?: string;
}

export interface AssembledLayout {
  templateId: string;
  pageCount: number;
  visualPersonality?: VisualPersonality;
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

export interface AiPromptAudit {
  id: string;
  prompt: string;
  resultStatus: string;
  diffSummary?: AiPromptAuditMeta | null;
  createdAt: string;
}

export interface AiPromptAuditMeta {
  kind?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  mode?: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  designNotes?: string;
  templateId?: string;
  articles?: number;
  images?: number;
  summary?: string;
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

export interface AdaptiveLayoutCandidateReport {
  id: string;
  label: string;
  selected?: boolean;
  geometryVariant:
    | "fixed"
    | "source-topology"
    | "lead-photo-swap"
    | "photo-lead-swap"
    | "brief-rail-swap"
    | "text-photo-rebalance"
    | "photo-band-expand"
    | "grammar-feature-stack"
    | "grammar-photo-mosaic";
  score: number;
  subscores: {
    occupancy: number;
    contentCoverage: number;
    requiredCoverage: number;
    balance: number;
    clippingRisk: number;
    geometryValidity: number;
    photoImpact: number;
    grammarAffinity: number;
    usefulOccupancy?: number;
    renderFit?: number;
    geometricCoverage?: number;
    porterReferenceAffinity?: number;
    porterReferenceId?: string;
  };
  warnings: string[];
  measurement?: {
    candidateId: string;
    clippedBlocks: number;
    overflowBlocks: number;
    missingImages: number;
    renderedImages: number;
    placeholderImages?: number;
    realRenderedImages?: number;
    totalImages: number;
    usefulOccupancy: number;
    underfilledBlocks?: number;
    fillRatios?: Array<{ blockId: string; fillRatio: number }>;
    clipDetails?: Array<{ blockId: string; overflowPx: number }>;
    geometricCoverage?: number;
    minPageUtility?: number;
    largestEmptyBandRatio?: number;
    lowUtilityBlocks: number;
    pageMetrics?: Array<{
      page: number;
      blockCount: number;
      contentBlockCount: number;
      imageBlocks: number;
      clippedBlocks: number;
      overflowBlocks: number;
      missingImages: number;
      placeholderImages?: number;
      renderFit: number;
      usefulOccupancy: number;
    }>;
  };
}

export interface EditorialPlanReport {
  leadArticleId?: string;
  photoGoal: "text-led" | "balanced" | "photo-led";
  density: "sparse" | "moderate" | "dense";
  visualPersonality: VisualPersonality;
  compositionGrammar:
    | "lead-story-collage"
    | "events-and-milestones"
    | "director-note-feature"
    | "photo-recap-spread"
    | "mixed-briefs";
  requiredArticleIds: string[];
  items: Array<{
    articleId: string;
    role:
      | "lead"
      | "executive-note"
      | "event"
      | "service"
      | "recurring"
      | "supporting";
    priority: number;
    required: boolean;
    preferredProminence: "hero" | "feature" | "standard" | "brief";
    trimMode: "preserve" | "sentence" | "brief";
  }>;
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

export interface FitAction {
  blockId: string;
  label: string;
  rung: 1 | 2 | 3 | 4;
  action: string;
  wordsIn?: number;
  wordsOut?: number;
  warning?: boolean;
}

export interface FitReport {
  summary: string;
  templatePath: Array<{ templateId: string; action: string; reason?: string }>;
  feasibility: {
    status: "fit" | "upgraded" | "optional-module-dropped" | "page-added";
    requiredWords: number;
    measuredCapacityWords: number;
    minimumCapacityWords: number;
  };
  actions: FitAction[];
  truncations: FitAction[];
  hardOverflowGate: boolean;
}

export interface PorterLayoutRuleResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "not-applicable";
  score: number;
  target: string;
  result: string;
}

export interface PorterLayoutPlaybookReport {
  family: string;
  score: number;
  summary: string;
  rules: PorterLayoutRuleResult[];
}

export interface PorterLayoutInvariantReport {
  passed: boolean;
  hardFailures: string[];
  warnings: string[];
  failures: Array<{
    id: string;
    severity: "hard" | "warning";
    message: string;
  }>;
}

export interface LayoutFitReport {
  chosenTemplateId: string;
  score: number;
  designMode?: "ai" | "deterministic";
  designNotes?: string;
  fallbackReason?: string;
  renderFit?: number;
  usefulOccupancy?: number;
  underfilledBlocks?: number;
  fillRatios?: Array<{ blockId: string; fillRatio: number }>;
  geometricCoverage?: number;
  minPageUtility?: number;
  largestEmptyBandRatio?: number;
  clippedBlocks?: number;
  overflowBlocks?: number;
  missingImages?: number;
  renderedImages?: number;
  placeholderImages?: number;
  realRenderedImages?: number;
  porterReferenceAffinity?: number;
  porterReferenceId?: string;
  innerSpreadAffinity?: number;
  fullOutputScore?: number;
  /** Ship-floor gate (V3 fix #1). passed=false blocks PDF export unless forced. */
  qualityGate?: {
    floor: number;
    finalScore: number;
    passed: boolean;
    reason?: string;
    hardFailures?: string[];
  };
  coverScore?: number;
  coverRenderFit?: number;
  coverClippedBlocks?: number;
  coverOverflowBlocks?: number;
  coverMissingImages?: number;
  coverContentBlocks?: number;
  coverImageBlocks?: number;
  coverDuplicateBirthdayBlocks?: number;
  fitReport?: FitReport;
  porterLayoutPlaybook?: PorterLayoutPlaybookReport;
  porterLayoutInvariants?: PorterLayoutInvariantReport;
  editorialPlan?: EditorialPlanReport;
  adaptiveCandidates?: AdaptiveLayoutCandidateReport[];
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
    wordCount?: number;
    byline?: string;
    sectionId?: string;
    imageRefs?: string[];
    articleType?: ArticleType;
    source?: "MOCK" | "UPLOAD" | "GENERATED";
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
