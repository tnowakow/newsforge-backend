import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import mammoth from "mammoth";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { extractImageMeta, parsePorterSubmissionText, porterParseToArticles } from "../services/uploadService.js";

export const uploadsRouter: Router = Router();
const require = createRequire(import.meta.url);
const heicConvert = require("heic-convert") as (input: {
  buffer: Buffer;
  format: "JPEG";
  quality: number;
}) => Promise<Buffer | ArrayBuffer>;

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
      cb(null, path.resolve(env.UPLOAD_DIR));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${createId()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB / file
});

const BROWSER_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const HEIC_IMAGE_EXTS = new Set([".heic", ".heif"]);
const IMAGE_EXTS = new Set([...BROWSER_IMAGE_EXTS, ...HEIC_IMAGE_EXTS]);
const TEXT_EXTS = new Set([".txt"]);
const DOCX_EXTS = new Set([".docx"]);

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

async function normalizeImageUpload(file: Express.Multer.File): Promise<{
  filePath: string;
  url: string;
  mime: string;
  size: number;
  convertedFrom?: string;
}> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!HEIC_IMAGE_EXTS.has(ext)) {
    return {
      filePath: file.path,
      url: `/uploads/${path.basename(file.path)}`,
      mime: file.mimetype,
      size: file.size,
    };
  }

  const convertedPath = file.path.replace(/\.(heic|heif)$/i, ".jpg");
  const input = await fs.readFile(file.path);
  const converted = await heicConvert({ buffer: input, format: "JPEG", quality: 0.92 });
  const output = Buffer.isBuffer(converted)
    ? converted
    : Buffer.from(new Uint8Array(converted));
  await fs.writeFile(convertedPath, output);
  await fs.unlink(file.path).catch(() => {});
  const stat = await fs.stat(convertedPath);
  return {
    filePath: convertedPath,
    url: `/uploads/${path.basename(convertedPath)}`,
    mime: "image/jpeg",
    size: stat.size,
    convertedFrom: ext.slice(1),
  };
}

uploadsRouter.post("/", upload.array("files", 30), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const clientId = typeof req.body.clientId === "string" ? req.body.clientId : null;

  if (clientId) {
    const exists = await prisma.client.findUnique({ where: { id: clientId } });
    if (!exists) {
      res.status(404).json({ error: "client_not_found" });
      return;
    }
  }

  const created: Array<Record<string, unknown>> = [];
  const skipped: Array<{ filename: string; reason: string }> = [];

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    try {
      if (IMAGE_EXTS.has(ext)) {
        const normalized = await normalizeImageUpload(file);
        const dimensions = await extractImageMeta({
          filePath: normalized.filePath,
          originalName: file.originalname,
          mime: normalized.mime,
        });
        const asset = await prisma.assetLibrary.create({
          data: {
            id: createId(),
            clientId,
            type: "IMAGE",
            contentOrUrl: normalized.url,
            source: "UPLOAD",
            meta: {
              originalFilename: file.originalname,
              mime: normalized.mime,
              originalMime: file.mimetype,
              size: normalized.size,
              width: dimensions.width,
              height: dimensions.height,
              format: dimensions.format,
              convertedFrom: normalized.convertedFrom,
            },
          },
        });
        created.push(asset);
      } else if (TEXT_EXTS.has(ext)) {
        const buf = await fs.readFile(file.path, "utf8");
        const asset = await prisma.assetLibrary.create({
          data: {
            id: createId(),
            clientId,
            type: "ARTICLE",
            contentOrUrl: buf,
            source: "UPLOAD",
            meta: {
              originalFilename: file.originalname,
              mime: file.mimetype,
              size: file.size,
              wordCount: wordCount(buf),
            },
          },
        });
        created.push(asset);
        // Clean up disk file (we stored the text inline).
        await fs.unlink(file.path).catch(() => {});
      } else if (DOCX_EXTS.has(ext)) {
        const result = await mammoth.extractRawText({ path: file.path });
        const text = result.value;
        const porterParse = parsePorterSubmissionText(text);
        const parsedArticles = porterParse.fallbackRequired ? [] : porterParseToArticles(porterParse);
        const parsedArticlesMeta = JSON.parse(JSON.stringify(parsedArticles));
        const cleanedText = porterParse.fallbackRequired
          ? text
          : parsedArticles
              .map((article) => `${article.title}\n${article.body}`)
              .concat(
                Object.entries(porterParse.captions).map(([filename, caption]) => `${filename}: ${caption}`),
              )
              .join("\n\n");
        const asset = await prisma.assetLibrary.create({
          data: {
            id: createId(),
            clientId,
            type: "ARTICLE",
            contentOrUrl: cleanedText,
            source: "UPLOAD",
            meta: {
              originalFilename: file.originalname,
              mime: file.mimetype,
              size: file.size,
              wordCount: wordCount(text),
              porterParse: {
                markers: porterParse.markers,
                fallbackRequired: porterParse.fallbackRequired,
                articleCount: porterParse.articles.length,
                listCount: porterParse.lists.length,
                datedRowCount: porterParse.lists.reduce((sum, list) => sum + list.rows.length, 0),
                warnings: porterParse.warnings,
                imageAssociations: porterParse.imageAssociations,
                captions: porterParse.captions,
                parsedArticles: parsedArticlesMeta,
              },
              // mammoth Message[] is a class instance array — stringify
              // so Prisma's JsonValue accepts it. Downstream reads treat
              // this as opaque debug metadata.
              mammothMessages: JSON.parse(JSON.stringify(result.messages)),
            },
          },
        });
        created.push(asset);
        await fs.unlink(file.path).catch(() => {});
      } else {
        skipped.push({ filename: file.originalname, reason: "unsupported_extension" });
        await fs.unlink(file.path).catch(() => {});
      }
    } catch (err) {
      skipped.push({
        filename: file.originalname,
        reason: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  res.status(201).json({ created, skipped });
});
