import { Router } from "express";
import { asyncHandler } from "../util/asyncHandler.js";
import { prisma } from "../db.js";
import { pdfHealth } from "../services/pdfService.js";

export const healthRouter = Router();

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const t0 = Date.now();
    let dbOk = false;
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const pdf = pdfHealth();
    res.json({
      status: dbOk && pdf.ready ? "ok" : "degraded",
      db: { ok: dbOk, ms: Date.now() - t0 },
      pdf,
      uptime: process.uptime(),
    });
  }),
);
