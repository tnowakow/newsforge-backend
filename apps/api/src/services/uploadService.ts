/**
 * uploadService — pure parse/consolidation helpers for uploaded assets.
 * Wraps mammoth (.docx) and plain-text buffer decode. Detects the generic
 * NewsForge submission template and strips instruction sections, per
 * Vitaly §2.4 / brief §4.E. Never touches the network or DB.
 *
 * Also exposes assembleAssetsForRun() so routes/runs.ts can consume upload
 * results without re-parsing on the request path (Vitaly §2.2).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import mammoth from "mammoth";
import type { Article, NewsImage } from "@newsforge/shared/schemas";
import type { ArticleType } from "@newsforge/shared/schemas";
import { classifyArticleType } from "./articleTypeClassifier.js";

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Detect our generic submission template. We ship it with a marker line so
 * the parser can strip everything above it.
 */
const TEMPLATE_MARKER = "--- NEWSFORGE ARTICLES BELOW ---";
const TEMPLATE_INSTRUCTIONS_HINT =
  /NewsForge Submission Template|Fill in each article below/i;

export interface ParsedArticleBlock {
  title: string;
  body: string;
  wordCount: number;
  articleType?: ArticleType;
  sectionId?: string;
  byline?: string;
  imageRefs?: string[];
}

export interface ParsedListRow {
  value: string;
  label: string;
}

export interface ParsedSubmissionList {
  label: string;
  panelRole: "happyHour" | "upcomingEvents" | "infoFooter";
  rows: ParsedListRow[];
}

export interface ParsedPorterSubmission {
  articles: ParsedArticleBlock[];
  lists: ParsedSubmissionList[];
  captions: Record<string, string>;
  imageAssociations: Record<string, string[]>;
  warnings: string[];
  markers: { start: boolean; end: boolean };
  fallbackRequired: boolean;
  birthdayPresent: boolean;
}

interface SubmissionParagraph {
  text: string;
}

function cleanSubmissionText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphsFromSubmission(rawText: string): SubmissionParagraph[] {
  return rawText
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((text) => ({ text: text.split("\n").map(cleanSubmissionText).filter(Boolean).join("\n") }))
    .filter((paragraph) => paragraph.text.length > 0);
}

function isInstructionLine(text: string): boolean {
  return /^(?:you must complete|list the file names|also include which photos|fill in a minimum|please only include|be sure to review|include which photos|do not insert photos|submit(?:ted)? separately)/i.test(text);
}

function sectionIdForHeader(header: string): string {
  if (/executive director/i.test(header)) return "director";
  if (/legacy news/i.test(header)) return "legacy";
  if (/upcoming campus events/i.test(header)) return "events";
  if (/photo captions/i.test(header)) return "captions";
  if (/interesting and newsworthy/i.test(header)) return "features";
  if (/department heads/i.test(header)) return "deptheads";
  return "custom";
}

function sectionHeaderRemainder(header: string, sectionId: string): string {
  const withoutPrefix = header.replace(/^REQUIRED\s*[-–—]\s*/i, "");
  const known = {
    director: /executive directors? corner/i,
    legacy: /legacy news/i,
    events: /upcoming campus events/i,
    captions: /photo captions/i,
    features: /interesting and newsworthy/i,
    deptheads: /department heads/i,
  }[sectionId as "director" | "legacy" | "events" | "captions" | "features" | "deptheads"];
  return known ? withoutPrefix.replace(known, "").trim() : withoutPrefix.trim();
}

function cleanArticleTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .replace(/\s+[,;:.!?]+$/g, "")
    .trim();
}

function addPhotoAssociations(
  refs: string[],
  sectionTitle: string,
  associations: Record<string, string[]>,
): void {
  for (const ref of refs) {
    const filename = ref.replace(/^['"]|['"]$/g, "").trim();
    if (!filename) continue;
    associations[filename] = [...new Set([...(associations[filename] ?? []), sectionTitle])];
  }
}

function parsePhotoRefs(text: string): { body: string; refs: string[] } {
  const match = text.match(/^(.*?)(?:\s*Photos?:\s*)(.+)$/i);
  if (!match) return { body: text, refs: [] };
  const rawRefs = match[2]
    .replace(/[.;]\s*$/g, "")
    .split(/,|\band\b/i)
    .map((ref) => ref.trim())
    .filter(Boolean);
  return {
    body: match[1].trim(),
    refs: rawRefs,
  };
}

/**
 * Parse the filled Porter/Trilogy Word submission using its two hard
 * boundaries. The returned object never contains preamble, optional-menu, or
 * department-head content. Missing markers are an explicit fallback state;
 * raw submission text is never returned as parsed article content.
 */
export function parsePorterSubmissionText(rawText: string): ParsedPorterSubmission {
  const paragraphs = paragraphsFromSubmission(rawText);
  const startIndex = paragraphs.findIndex((p) => /^required articles$/i.test(p.text.trim()));
  const endIndex = paragraphs.findIndex(
    (p, index) => index > startIndex && /^optional article suggestions$/i.test(p.text.trim()),
  );
  const markers = { start: startIndex >= 0, end: endIndex > startIndex };
  if (!markers.start || !markers.end) {
    const missing = [!markers.start ? "start" : "", !markers.end ? "end" : ""].filter(Boolean).join(",");
    console.warn(`deterministic-markers-missing: ${missing}`);
    return {
      articles: [],
      lists: [],
      captions: {},
      imageAssociations: {},
      warnings: [`deterministic-markers-missing: ${missing}`],
      markers,
      fallbackRequired: true,
      birthdayPresent: false,
    };
  }

  const window = paragraphs.slice(startIndex + 1, endIndex);
  const sections: Array<{ id: string; header: string; paragraphs: string[] }> = [];
  for (const paragraph of window) {
    const headerMatch = paragraph.text.match(/^REQUIRED\s*[-–—]\s*(.*)$/i);
    if (headerMatch) {
      sections.push({ id: sectionIdForHeader(headerMatch[1]), header: headerMatch[1], paragraphs: [] });
      const remainder = sectionHeaderRemainder(paragraph.text, sectionIdForHeader(headerMatch[1]));
      if (remainder && !isInstructionLine(remainder) && sectionIdForHeader(headerMatch[1]) !== "events") {
        sections.at(-1)?.paragraphs.push(remainder);
      }
    } else if (sections.length > 0) {
      sections.at(-1)?.paragraphs.push(...paragraph.text.split("\n").map(cleanSubmissionText).filter(Boolean));
    }
  }

  const articles: ParsedArticleBlock[] = [];
  const lists: ParsedSubmissionList[] = [];
  const captions: Record<string, string> = {};
  const imageAssociations: Record<string, string[]> = {};
  const warnings: string[] = [];

  for (const section of sections) {
    if (section.id === "deptheads") continue;
    if (section.id === "captions") {
      for (const line of section.paragraphs) {
        if (isInstructionLine(line)) continue;
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match) captions[match[1].trim()] = match[2].trim();
      }
      continue;
    }
    if (section.id === "events") {
      let current: ParsedSubmissionList | undefined;
      const allLines = [section.header, ...section.paragraphs];
      for (const rawLine of allLines) {
        const line = rawLine.trim();
        const labels: Array<[RegExp, ParsedSubmissionList["label"], ParsedSubmissionList["panelRole"]]> = [
          [/happy hours?:/i, "Happy Hours", "happyHour"],
          [/socials?:/i, "Socials", "upcomingEvents"],
          [/brunch:?/i, "Brunch", "infoFooter"],
        ];
        const label = labels.find(([pattern]) =>
          pattern.test(line) && (rawLine === section.header || /^(?:happy hours?|socials?|brunch)/i.test(line)),
        );
        if (label) {
          current = { label: label[1], panelRole: label[2], rows: [] };
          lists.push(current);
          const after = line.replace(label[0], "").trim();
          const row = after.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
          if (row) current.rows.push({ value: row[1], label: row[2].trim() });
          continue;
        }
        const row = line.match(/^(\d{1,2}\/\d{1,2})\s+(.+)$/);
        if (row && current) current.rows.push({ value: row[1], label: row[2].trim() });
      }
      continue;
    }

    const content: Array<{ body: string; refs: string[] }> = [];
    const refs: string[] = [];
    for (const line of section.paragraphs) {
      if (isInstructionLine(line) || /^\d+\.\s*\(optional\)\s*$/i.test(line)) continue;
      const photo = parsePhotoRefs(line);
      refs.push(...photo.refs);
      if (photo.body) content.push({ body: photo.body, refs: photo.refs });
    }
    if (refs.length) addPhotoAssociations(refs, section.id, imageAssociations);
    if (section.id === "features") {
      for (const item of content) {
        const { body } = item;
        if (body.length < 20) continue;
        const title = cleanArticleTitle(body.split(/[.!?]/, 1)[0].trim().slice(0, 120)) || "Interesting and Newsworthy";
        if (item.refs.length) addPhotoAssociations(item.refs, title, imageAssociations);
        articles.push({
          title,
          body,
          wordCount: wordCount(body),
          articleType: /anniversary|color|chef/i.test(body) ? "announcement" : "other",
          sectionId: "features",
          imageRefs: item.refs,
        });
      }
      continue;
    }
    if (section.id === "director" || section.id === "legacy" || section.id === "custom") {
      if (content.length === 0) continue;
      const title = section.id === "director" ? "Executive Director Corner" : section.id === "legacy" ? "Legacy News" : section.header;
      const body = content.map((item) => item.body).join("\n\n");
      articles.push({
        title,
        body,
        wordCount: wordCount(body),
        articleType: section.id === "director" ? "executive-note" : section.id === "legacy" ? "resident-story" : "other",
        sectionId: section.id,
        byline: section.id === "director" ? "From the Executive Director" : undefined,
        imageRefs: refs,
      });
    }
  }

  const birthdayPresent = sections.some((section) => /birthday/i.test(`${section.id} ${section.header}`));
  if (!birthdayPresent) warnings.push("birthday-source-missing: use recurring roster or evergreen teaser");
  if (sections.some((section) => section.id === "custom")) warnings.push("custom-section-preserved");
  return { articles, lists, captions, imageAssociations, warnings, markers, fallbackRequired: false, birthdayPresent };
}

export function porterParseToArticles(parse: ParsedPorterSubmission): Article[] {
  const articles: Article[] = parse.articles.map((article) => ({
    id: createId(),
    title: article.title,
    body: article.body,
    wordCount: article.wordCount,
    byline: article.byline,
    sectionId: article.sectionId,
    imageRefs: article.imageRefs,
    isFiller: false,
    source: "UPLOAD" as const,
    articleType: article.articleType,
  }));

  const lists: Article[] = parse.lists
    .filter((list) => list.rows.length > 0)
    .map((list) => {
      const body = list.rows.map((row) => `${row.value} ${row.label}`).join("\n");
      return {
        id: createId(),
        title: list.label,
        body,
        wordCount: wordCount(body),
        sectionId: list.panelRole,
        isFiller: false,
        source: "UPLOAD" as const,
        articleType: list.panelRole === "happyHour" || list.panelRole === "upcomingEvents"
          ? "event-recap" as const
          : "announcement" as const,
      };
    });

  return [...articles, ...lists];
}

/**
 * Split a submission-template body into per-article blocks.
 * Rules:
 *  - If TEMPLATE_MARKER is present, drop everything above it.
 *  - Else if the "hint" line is present, drop everything up to (and
 *    including) the first "[Article Name]" occurrence.
 *  - Then split on "## Article <N>" headings.
 *  - Within a block: first non-empty line = title (strip leading "[Article
 *    Name]" placeholder if left in); everything after next blank line = body.
 *  - Skip blocks where body still contains "[Article Body]" placeholder or
 *    is empty (buildings leave unused sections blank per Vitaly §9 Q2).
 */
export function splitSubmissionTemplate(rawText: string): ParsedArticleBlock[] {
  let text = rawText.replace(/\r\n/g, "\n");

  const markerIdx = text.indexOf(TEMPLATE_MARKER);
  if (markerIdx >= 0) {
    text = text.slice(markerIdx + TEMPLATE_MARKER.length);
  } else if (TEMPLATE_INSTRUCTIONS_HINT.test(text)) {
    // Drop the instructions section by finding the first "## Article"
    // heading and slicing from there.
    const firstArticle = text.search(/^##\s*Article\s+\d+/im);
    if (firstArticle >= 0) text = text.slice(firstArticle);
  }

  // Split on "## Article <N>" (case-insensitive). If no headings, treat the
  // whole text as one article.
  const parts = text.split(/^##\s*Article\s+\d+\s*$/im);
  const blocks: ParsedArticleBlock[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip placeholder-only sections.
    const stripped = trimmed
      .replace(/\[Article Name\]/gi, "")
      .replace(/\[Article Body\]/gi, "")
      .trim();
    if (!stripped) continue;

    // First non-empty line is the title.
    const lines = trimmed.split("\n");
    let title = "";
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/^\[Article Name\]\s*/i, "").trim();
      if (line) {
        title = line;
        bodyStart = i + 1;
        break;
      }
    }

    let body = lines
      .slice(bodyStart)
      .join("\n")
      .replace(/\[Article Body\]/gi, "")
      .trim();

    if (!title && !body) continue;
    if (!title) title = "Untitled";
    if (!body) continue;

    blocks.push({
      title,
      body,
      wordCount: wordCount(body),
    });
  }

  // If we produced nothing but the raw text is non-empty, fall back to
  // single-article: first line = title, rest = body.
  if (blocks.length === 0) {
    const trimmed = rawText.trim();
    if (trimmed.length > 0) {
      const lines = trimmed.split(/\n/);
      const title = (lines[0] ?? "Untitled").slice(0, 200);
      const body = lines.slice(1).join("\n").trim() || trimmed;
      blocks.push({ title, body, wordCount: wordCount(body) });
    }
  }

  return blocks;
}

// ---- File parsers ----

export async function parseDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

export async function parseTxt(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function parseArticleFile(
  filePath: string,
  originalName?: string,
): Promise<ParsedArticleBlock[]> {
  const ext = path.extname(originalName ?? filePath).toLowerCase();
  let text: string;
  if (ext === ".docx") text = await parseDocx(filePath);
  else if (ext === ".txt") text = await parseTxt(filePath);
  else throw new Error(`unsupported_extension:${ext}`);
  if (ext === ".docx") {
    const porter = parsePorterSubmissionText(text);
    if (!porter.fallbackRequired) return porter.articles;
  }
  return splitSubmissionTemplate(text);
}

export async function parsePorterSubmissionFile(filePath: string): Promise<ParsedPorterSubmission> {
  return parsePorterSubmissionText(await parseDocx(filePath));
}

/**
 * Batch-classify a set of parsed article blocks with articleType.
 * Uses classifyArticleType which itself has a heuristic fallback.
 */
export async function classifyBlocks(
  blocks: ParsedArticleBlock[],
): Promise<ParsedArticleBlock[]> {
  return Promise.all(
    blocks.map(async (b) => {
      const r = await classifyArticleType({
        title: b.title,
        body: b.body,
        wordCount: b.wordCount,
      });
      return { ...b, articleType: r.articleType };
    }),
  );
}

/**
 * Convert parsed blocks to Article DTOs ready for routes/runs.ts.
 */
export function blocksToArticles(blocks: ParsedArticleBlock[]): Article[] {
  return blocks.map((b) => ({
    id: createId(),
    title: b.title,
    body: b.body,
    wordCount: b.wordCount,
    imageRefs: b.imageRefs,
    isFiller: false,
    source: "UPLOAD" as const,
    articleType: b.articleType,
  }));
}

// ---- Image metadata (best-effort, no sharp dep) ----

export interface ImageMetaInput {
  filePath: string;
  originalName?: string;
  mime?: string;
}

export interface ImageMeta {
  width?: number;
  height?: number;
  exifPresent?: boolean;
  format?: string;
}

/**
 * Very lightweight image metadata reader (JPEG SOI / PNG IHDR / WebP RIFF).
 * We deliberately avoid sharp/exifr as a dependency — the values here are
 * good enough for stock-photo heuristic scoring. exifPresent is set to
 * `undefined` when we can't determine; complianceService treats missing
 * as "no signal" rather than a positive stock indicator.
 */
export async function extractImageMeta(input: ImageMetaInput): Promise<ImageMeta> {
  try {
    const buf = await fs.readFile(input.filePath);
    if (buf.length < 12) return {};
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      return { width, height, exifPresent: false, format: "png" };
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      let width: number | undefined;
      let height: number | undefined;
      let exifPresent = false;
      while (i < buf.length - 1) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        const segLen = buf.readUInt16BE(i + 2);
        // EXIF APP1 has "Exif" magic.
        if (marker === 0xe1 && buf.slice(i + 4, i + 8).toString("ascii") === "Exif") {
          exifPresent = true;
        }
        // SOFn markers carry dimensions.
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          height = buf.readUInt16BE(i + 5);
          width = buf.readUInt16BE(i + 7);
        }
        i += 2 + segLen;
      }
      return { width, height, exifPresent, format: "jpeg" };
    }
    // WebP (RIFF....WEBP)
    if (
      buf.slice(0, 4).toString("ascii") === "RIFF" &&
      buf.slice(8, 12).toString("ascii") === "WEBP"
    ) {
      return { exifPresent: false, format: "webp" };
    }
    return {};
  } catch {
    return {};
  }
}

export interface PrintDpiAssessment {
  effectiveDpi?: number;
  belowMinimum: boolean;
  note?: string;
}

/** Informational only: low-resolution photos are always accepted and placed. */
export function assessPrintDpi(input: {
  width?: number;
  height?: number;
  placementWidthInches: number;
  placementHeightInches?: number;
  minimumDpi?: number;
  label?: string;
}): PrintDpiAssessment {
  if (!input.width || !input.height || input.placementWidthInches <= 0) return { belowMinimum: false };
  const widthDpi = input.width / input.placementWidthInches;
  const heightDpi = input.placementHeightInches && input.placementHeightInches > 0
    ? input.height / input.placementHeightInches
    : widthDpi;
  const effectiveDpi = Math.round(Math.min(widthDpi, heightDpi));
  const minimumDpi = input.minimumDpi ?? 200;
  return effectiveDpi < minimumDpi
    ? { effectiveDpi, belowMinimum: true, note: `${input.label ?? "Photo"} placed below ${minimumDpi} DPI at print size` }
    : { effectiveDpi, belowMinimum: false };
}

/**
 * Utility for routes/runs.ts: given a list of uploaded asset ids (Article
 * type), return typed Article DTOs. Callers separately fetch images by id.
 * Left as an intentional thin helper — full DB access is in the route.
 */
export function assetTextToArticle(
  text: string,
  meta: { title?: string; articleType?: ArticleType } = {},
): Article {
  const title = meta.title ?? text.trim().split("\n")[0]?.slice(0, 120) ?? "Untitled";
  const body = text.trim();
  return {
    id: createId(),
    title,
    body,
    wordCount: wordCount(body),
    isFiller: false,
    source: "UPLOAD",
    articleType: meta.articleType,
  };
}

/**
 * Turn image asset rows into NewsImage DTOs.
 */
export function assetImageToNewsImage(row: {
  id: string;
  contentOrUrl: string;
  meta: unknown;
}): NewsImage {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    url: row.contentOrUrl,
    caption: typeof meta.caption === "string" ? meta.caption : undefined,
    alt: typeof meta.alt === "string" ? meta.alt : undefined,
    aspect:
      meta.aspect === "square" ||
      meta.aspect === "portrait" ||
      meta.aspect === "landscape"
        ? meta.aspect
        : "landscape",
    isPlaceholder: false,
    source: "UPLOAD",
    width: typeof meta.width === "number" ? meta.width : undefined,
    height: typeof meta.height === "number" ? meta.height : undefined,
  };
}
