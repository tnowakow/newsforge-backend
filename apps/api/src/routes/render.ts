/**
 * INTERNAL render route. Returns a bare HTML page for Puppeteer to print.
 * Guarded by internalOnly middleware (127.0.0.1 + INTERNAL_RENDER_KEY).
 *
 * The PUBLIC iframe path is /api/runs/:id/preview-html (see routes/runs.ts).
 * Both routes share the same HTML produced by services/runHtml.ts so the
 * on-screen preview is byte-identical to what Puppeteer prints.
 */
import { Router } from "express";
import { internalOnly } from "../middleware/internalOnly.js";
import { buildRunHtml } from "../services/runHtml.js";

export const renderRouter: Router = Router();

renderRouter.get("/:runId", internalOnly, async (req, res) => {
  const result = await buildRunHtml(String(req.params.runId));
  if (!result.ok) {
    res.status(result.status).send(result.reason);
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Internal-only; never let an intermediary cache.
  res.setHeader("Cache-Control", "no-store");
  res.send(result.html);
});
