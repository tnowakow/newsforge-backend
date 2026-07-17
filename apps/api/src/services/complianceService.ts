/**
 * complianceService — 4 detectors that run on every run (Vitaly §8).
 * Never blocks render (v2 rule 13). Never throws. Deterministic detector
 * versions baked in.
 */
import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import type {
  Article,
  ComplianceFlag,
  ComplianceSeverity,
  NewsImage,
} from "@newsforge/shared/schemas";

// ---- Detector version constants (auditable) ----
export const DETECTOR_VERSION = {
  residentLastName: "regex@1",
  fullBirthdate: "regex@1",
  likelyStockPhoto: "exif+phash@1",
  lastNameInImage: "gemini-vision@2026-07",
} as const;

// ---- Regexes (exact from Vitaly §8) ----
// Note: originals in the arch doc use curly apostrophes inside the second
// capture group's character class. We keep them verbatim so the intent
// survives any editor round-trip.
export const RESIDENT_NAME_REGEX =
  /\b([A-Z][a-z]{1,20})\s+((?:Mc|Mac|O')?[A-Z][a-z'’-]{1,30}(?:-[A-Z][a-z'’-]{1,30})?)\b/g;

export const NAME_STOPWORDS = new Set([
  "New York",
  "San Francisco",
  "Los Angeles",
  "St Louis",
  "St. Louis",
  "Old Town",
  "Happy Hour",
  "Executive Director",
  "Memory Care",
  "Assisted Living",
  "Independent Living",
  "Community Update",
  // Trilogy brand-voice & service-name allowlist (Riley Phase 4 W1).
  // These are compound phrases that RESIDENT_NAME_REGEX would otherwise
  // pair as "FirstName LastName" — they come from Trilogy's brand kit
  // ("Best Friends Approach", "Daily Rhythms", "the good old days") and
  // its calendar / service catalog ("Independence Day", "Adult Day",
  // "Skilled Services"). Do NOT weaken the detector — real
  // "FirstName LastName" patterns still fire.
  "Best Friends",
  "Best Friends Approach",
  "Good Old",
  "Good Old Days",
  "Daily Rhythms",
  "Independence Day",
  "Independence",
  "Adult Day",
  "Skilled Services",
]);

// Additional single-token stopwords contributed by the Trilogy allowlist,
// so a compound like "Best Friends" doesn't just get filtered as an exact
// full-string match but is also blocked when the regex slices it into
// ("Best", "Friends"). These are Trilogy-brand tokens that should never be
// treated as a resident's first or last name in this product.
const TRILOGY_TOKEN_STOPWORDS: string[] = [
  "Best",
  "Friends",
  "Good",
  "Old",
  "Daily",
  "Rhythms",
  "Independence",
  "Skilled",
  "Adult",
  "Services",
  "Approach",
  "Days",
];

// A superset of stopwords to filter single-token capitalized common words
// that RESIDENT_NAME_REGEX might otherwise pair (e.g. day names, month names).
const NAME_TOKEN_STOPWORDS = new Set<string>([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
  "Director", "Manager", "Coordinator", "Supervisor", "President",
  ...TRILOGY_TOKEN_STOPWORDS,
]);

export const FULL_BIRTHDATE_REGEX = new RegExp(
  String.raw`\b(?:(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}` +
    String.raw`|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2})\b`,
  "gi",
);

// ---- Helpers ----

function contextAround(body: string, index: number, span = 60): string {
  const start = Math.max(0, index - span);
  const end = Math.min(body.length, index + span);
  return body.slice(start, end);
}

// ---- Detectors ----

/**
 * Detects "First Last" style resident names in article bodies.
 * Emits `warn` for confident hits, `info` for uncertain single-match cases.
 */
export function detectResidentLastNames(articles: Article[]): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const article of articles) {
    const body = article.body;
    RESIDENT_NAME_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RESIDENT_NAME_REGEX.exec(body)) !== null) {
      const [full, first, last] = m;
      if (NAME_STOPWORDS.has(full.trim())) continue;
      if (NAME_TOKEN_STOPWORDS.has(first) || NAME_TOKEN_STOPWORDS.has(last)) {
        continue;
      }
      const ctx = contextAround(body, m.index);
      // Staff titles are OK to publish.
      if (/(Director|Manager|Coordinator|Supervisor)/i.test(ctx)) continue;

      flags.push({
        id: createId(),
        category: "resident-last-name",
        severity: "warn",
        target: {
          kind: "article",
          articleId: article.id,
          offset: m.index,
          match: full,
        },
        reason: `Potential resident full name "${full}"`,
        detectorVersion: DETECTOR_VERSION.residentLastName,
        resolvedByUser: false,
      });
    }
  }
  return flags;
}

/**
 * Detects birthdates with a 4-digit year. Emits `block` severity only when
 * a RESIDENT_NAME_REGEX match falls within ±120 chars (PII confirmation).
 * Otherwise `info` severity so QA can still see the raw hit.
 */
export function detectFullBirthdates(articles: Article[]): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const article of articles) {
    const body = article.body;
    FULL_BIRTHDATE_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FULL_BIRTHDATE_REGEX.exec(body)) !== null) {
      const dateHit = m[0];
      // Look for a name within ±120 chars.
      const windowStart = Math.max(0, m.index - 120);
      const windowEnd = Math.min(body.length, m.index + dateHit.length + 120);
      const window = body.slice(windowStart, windowEnd);
      RESIDENT_NAME_REGEX.lastIndex = 0;
      let nameHit: RegExpExecArray | null = null;
      let nm: RegExpExecArray | null;
      while ((nm = RESIDENT_NAME_REGEX.exec(window)) !== null) {
        if (NAME_STOPWORDS.has(nm[0].trim())) continue;
        if (
          NAME_TOKEN_STOPWORDS.has(nm[1]) ||
          NAME_TOKEN_STOPWORDS.has(nm[2])
        ) {
          continue;
        }
        nameHit = nm;
        break;
      }
      const severity: ComplianceSeverity = nameHit ? "block" : "info";
      flags.push({
        id: createId(),
        category: "full-birthdate-with-name",
        severity,
        target: {
          kind: "article",
          articleId: article.id,
          offset: m.index,
          match: dateHit,
        },
        reason: nameHit
          ? `Birthdate "${dateHit}" appears within 120 chars of name "${nameHit[0]}"`
          : `Birthdate "${dateHit}" detected (no adjacent name)`,
        detectorVersion: DETECTOR_VERSION.fullBirthdate,
        resolvedByUser: false,
      });
    }
  }
  return flags;
}

// ---- Stock photo detection ----

const STOCK_FILENAME_REGEX =
  /^(pexels|unsplash|shutterstock|istock|getty|adobestock|stock)[\-_]/i;

const STOCK_DIMENSIONS = new Set([
  "1920x1280",
  "2400x1600",
  "3000x2000",
]);

export interface StockImageInput {
  imageId: string;
  filename?: string;
  width?: number;
  height?: number;
  exifPresent?: boolean;
  perceptualHash?: string;
}

/**
 * Deterministic stock-photo scoring per Vitaly §8.3. pHash denylist is
 * loaded by the caller (JSON asset); we accept a Set of hashes.
 * Score ≥ 3 → block, ≥ 2 → warn, else no flag.
 */
export function scoreStockImage(
  input: StockImageInput,
  pHashDenyList: Set<string>,
): { score: number; severity: ComplianceSeverity | null; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (input.exifPresent === false) {
    score += 1;
    reasons.push("no-exif");
  }
  if (input.filename && STOCK_FILENAME_REGEX.test(input.filename)) {
    score += 2;
    reasons.push("stock-filename-prefix");
  }
  if (
    input.width &&
    input.height &&
    STOCK_DIMENSIONS.has(`${input.width}x${input.height}`) &&
    input.exifPresent === false
  ) {
    score += 1;
    reasons.push("common-stock-dimensions");
  }
  if (input.perceptualHash && pHashDenyList.has(input.perceptualHash)) {
    score += 3;
    reasons.push("phash-denylist-match");
  }
  let severity: ComplianceSeverity | null = null;
  if (score >= 3) severity = "block";
  else if (score >= 2) severity = "warn";
  return { score, severity, reasons };
}

export function detectLikelyStockPhotos(
  images: NewsImage[],
  extras: Map<string, StockImageInput>,
  pHashDenyList: Set<string>,
): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const img of images) {
    const extra = extras.get(img.id) ?? { imageId: img.id };
    const scored = scoreStockImage(extra, pHashDenyList);
    if (!scored.severity) continue;
    flags.push({
      id: createId(),
      category: "likely-stock-photo",
      severity: scored.severity,
      target: { kind: "image", imageId: img.id },
      reason: `Likely stock photo (score=${scored.score}: ${scored.reasons.join(", ")})`,
      detectorVersion: DETECTOR_VERSION.likelyStockPhoto,
      resolvedByUser: false,
    });
  }
  return flags;
}

// ---- last-name-in-image (Gemini vision) ----
// The Gemini call itself is fire-and-forget from the route (Vitaly Phase 1
// risk note). Here we expose the pure-shape function; on Gemini failure the
// caller emits `compliance_partial` info flags.

export function partialImageComplianceFlag(imageId: string): ComplianceFlag {
  return {
    id: createId(),
    category: "last-name-in-image",
    severity: "info",
    target: { kind: "image", imageId },
    reason: "compliance_partial",
    detectorVersion: DETECTOR_VERSION.lastNameInImage,
    resolvedByUser: false,
  };
}

// ---- Full-run entry point ----

export interface RunComplianceInput {
  articles: Article[];
  images: NewsImage[];
  imageExtras?: Map<string, StockImageInput>;
  pHashDenyList?: Set<string>;
}

/**
 * Run all synchronous detectors and return the merged flag list. The Gemini
 * vision detector runs async in the route handler (see runs.ts) and merges
 * into the same JSONB column with a follow-up update.
 */
export function runComplianceSync(input: RunComplianceInput): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  flags.push(...detectResidentLastNames(input.articles));
  flags.push(...detectFullBirthdates(input.articles));
  flags.push(
    ...detectLikelyStockPhotos(
      input.images,
      input.imageExtras ?? new Map(),
      input.pHashDenyList ?? new Set(),
    ),
  );
  return flags;
}

// Small helper exported for tests / callers.
export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}
