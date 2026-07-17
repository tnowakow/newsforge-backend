import { Router } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const uploadsRouter: Router = Router();

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

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const TEXT_EXTS = new Set([".txt"]);
const DOCX_EXTS = new Set([".docx"]);

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
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
        const url = `/uploads/${path.basename(file.path)}`;
        const asset = await prisma.assetLibrary.create({
          data: {
            id: createId(),
            clientId,
            type: "IMAGE",
            contentOrUrl: url,
            source: "UPLOAD",
            meta: {
              originalFilename: file.originalname,
              mime: file.mimetype,
              size: file.size,
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
        const asset = await prisma.assetLibrary.create({
          data: {
            id: createId(),
            clientId,
            type: "ARTICLE",
            contentOrUrl: text,
            source: "UPLOAD",
            meta: {
              originalFilename: file.originalname,
              mime: file.mimetype,
              size: file.size,
              wordCount: wordCount(text),
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
