/**
 * v3 export routes. Mounted alongside runsRouter at /api/runs.
 *
 * POST /api/runs/:id/export/idml
 *   Builds the IDML package (newsletter.idml + Links/ + README) and returns
 *   a URL under /pdfs/. Complements — does not replace — the existing
 *   /export/indesign-bundle raw hand-off zip.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { LETTER_RENDER_CONTRACT } from "@newsforge/shared";
import { digestFinalArtifact } from "../services/finalArtifactGate.js";
import { buildIdmlPackage } from "../services/idmlService.js";

export const exportsV3Router: Router = Router();

exportsV3Router.post("/:id/export/idml", async (req, res) => {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: String(req.params.id) },
    select: { layoutFitReport: true, assembledLayout: true, articles: true, images: true },
  });
  if (!run) {
    res.status(404).json({ error: "run_not_found" });
    return;
  }
  const report = run.layoutFitReport as { finalArtifactGate?: { passed?: boolean; failures?: string[]; contentDigest?: string; renderContractDigest?: string } } | null;
  const currentContentDigest = digestFinalArtifact({ layout: run.assembledLayout, articles: run.articles, images: run.images });
  const currentRenderContractDigest = digestFinalArtifact(LETTER_RENDER_CONTRACT);
  const bound = report?.finalArtifactGate?.contentDigest === currentContentDigest && report?.finalArtifactGate?.renderContractDigest === currentRenderContractDigest;
  const forced = req.query.force === "1" || req.query.force === "true" || (req.body as { force?: unknown } | undefined)?.force === true;
  if ((!report?.finalArtifactGate?.passed || !bound) && !forced) {
    const failures = [...(report?.finalArtifactGate?.failures ?? ["final-artifact-report-missing"]), ...(!bound ? ["stale-or-unbound-report"] : [])];
    res.status(409).json({
      error: "final_artifact_gate_blocked",
      finalArtifactGate: report?.finalArtifactGate ?? { passed: false, failures },
      message: "Final rendered artifact has not passed acceptance checks; diagnostic force export is not demo-ready.",
    });
    return;
  }
  const result = await buildIdmlPackage(String(req.params.id));
  if (!result.ok) {
    res.status(result.status).json({ error: result.reason });
    return;
  }
  res.json({ ok: true, url: result.publicUrl, fileName: result.fileName, acceptanceEligible: !forced });
});
