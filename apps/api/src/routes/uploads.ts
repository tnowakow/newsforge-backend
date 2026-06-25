import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../util/asyncHandler.js";
import { writeLimiter } from "../middleware/rateLimit.js";
import { ingestUploads } from "../services/uploadService.js";
import { ValidationError } from "../util/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 12 },
});

export const uploadsRouter = Router();

uploadsRouter.post(
  "/",
  writeLimiter,
  upload.array("files", 12),
  asyncHandler(async (req, res) => {
    const clientId = String(req.body.clientId ?? "");
    if (!clientId) throw new ValidationError("clientId is required");
    const runId = typeof req.body.runId === "string" ? req.body.runId : undefined;
    const pastedText = typeof req.body.pastedText === "string" ? req.body.pastedText : undefined;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const out = await ingestUploads({
      clientId,
      runId,
      pastedText,
      files: files.map((f) => ({
        originalName: f.originalname,
        mimetype: f.mimetype,
        buffer: f.buffer,
        size: f.size,
      })),
    });
    res.status(201).json(out);
  }),
);
