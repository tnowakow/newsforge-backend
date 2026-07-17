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
  return splitSubmissionTemplate(text);
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
  };
}
