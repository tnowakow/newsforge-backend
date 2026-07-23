/**
 * v3 export routes. Mounted alongside runsRouter at /api/runs.
 *
 * POST /api/runs/:id/export/idml
 *   Builds the IDML package (newsletter.idml + Links/ + README) and returns
 *   a URL under /pdfs/. Complements — does not replace — the existing
 *   /export/indesign-bundle raw hand-off zip.
 */
import { Router } from "express";
import { buildIdmlPackage } from "../services/idmlService.js";

export const exportsV3Router: Router = Router();

exportsV3Router.post("/:id/export/idml", async (req, res) => {
  const result = await buildIdmlPackage(String(req.params.id));
  if (!result.ok) {
    res.status(result.status).json({ error: result.reason });
    return;
  }
  res.json({ ok: true, url: result.publicUrl, fileName: result.fileName });
});
