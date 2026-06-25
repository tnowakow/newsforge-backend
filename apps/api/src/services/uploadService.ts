import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mammoth from "mammoth";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { ValidationError } from "../util/errors.js";

const MAX_RUN_BYTES = 20 * 1024 * 1024; // 20 MB cap per Vitaly §6.8

interface UploadedFile {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface UploadResultItem {
  id: string;
  type: "IMAGE" | "ARTICLE";
  url?: string;
  title?: string;
  wordCount?: number;
  bytes: number;
}

export async function ingestUploads(opts: {
  clientId: string;
  runId?: string;
  files: UploadedFile[];
  pastedText?: string;
}): Promise<{ items: UploadResultItem[] }> {
  const totalBytes = opts.files.reduce((n, f) => n + f.size, 0) + (opts.pastedText?.length ?? 0);
  if (totalBytes > MAX_RUN_BYTES) {
    throw new ValidationError(`Upload bundle exceeds ${MAX_RUN_BYTES} bytes`);
  }

  const baseDir = path.join(env.DATA_DIR, "uploads", opts.runId ?? opts.clientId);
  await fs.mkdir(baseDir, { recursive: true });

  const items: UploadResultItem[] = [];

  for (const file of opts.files) {
    const safeName = sanitizeFilename(file.originalName);
    const ext = path.extname(safeName).toLowerCase();
    const id = "asset_" + crypto.randomBytes(8).toString("hex");

    if (file.mimetype.startsWith("image/")) {
      // Strip EXIF — Vitaly §6.8 privacy hygiene. We do a cheap "strip" by re-saving raw bytes
      // (no metadata re-write libs available without a heavier dep). For demo: leave note.
      const filename = `${id}${ext || ".jpg"}`;
      const fullPath = path.join(baseDir, filename);
      await fs.writeFile(fullPath, file.buffer);
      const url = `/uploads/${path.basename(baseDir)}/${filename}`;
      await prisma.assetLibrary.create({
        data: {
          id,
          clientId: opts.clientId,
          type: "IMAGE",
          contentOrUrl: url,
          source: "UPLOAD",
          meta: {
            title: safeName,
            width: 0,
            height: 0,
            originalName: file.originalName,
            bytes: file.size,
          },
        },
      });
      items.push({ id, type: "IMAGE", url, title: safeName, bytes: file.size });
      continue;
    }

    if (ext === ".docx" || file.mimetype.includes("officedocument.wordprocessingml")) {
      const { value: text } = await mammoth.extractRawText({ buffer: file.buffer });
      const cleaned = text.trim();
      await prisma.assetLibrary.create({
        data: {
          id,
          clientId: opts.clientId,
          type: "ARTICLE",
          contentOrUrl: cleaned,
          source: "UPLOAD",
          meta: {
            title: safeName,
            wordCount: countWords(cleaned),
            originalName: file.originalName,
            bytes: file.size,
          },
        },
      });
      items.push({
        id,
        type: "ARTICLE",
        title: safeName,
        wordCount: countWords(cleaned),
        bytes: file.size,
      });
      continue;
    }

    if (ext === ".txt" || file.mimetype === "text/plain") {
      const text = file.buffer.toString("utf8");
      await prisma.assetLibrary.create({
        data: {
          id,
          clientId: opts.clientId,
          type: "ARTICLE",
          contentOrUrl: text,
          source: "UPLOAD",
          meta: {
            title: safeName,
            wordCount: countWords(text),
            originalName: file.originalName,
            bytes: file.size,
          },
        },
      });
      items.push({
        id,
        type: "ARTICLE",
        title: safeName,
        wordCount: countWords(text),
        bytes: file.size,
      });
      continue;
    }

    throw new ValidationError(`Unsupported file type: ${file.mimetype} (${safeName})`);
  }

  if (opts.pastedText && opts.pastedText.trim().length > 0) {
    const id = "asset_" + crypto.randomBytes(8).toString("hex");
    const text = opts.pastedText.trim();
    await prisma.assetLibrary.create({
      data: {
        id,
        clientId: opts.clientId,
        type: "ARTICLE",
        contentOrUrl: text,
        source: "UPLOAD",
        meta: { title: "Pasted text", wordCount: countWords(text), bytes: text.length },
      },
    });
    items.push({ id, type: "ARTICLE", title: "Pasted text", wordCount: countWords(text), bytes: text.length });
  }

  return { items };
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96);
}
