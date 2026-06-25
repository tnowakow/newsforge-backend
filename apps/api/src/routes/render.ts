import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { NotFoundError } from "../util/errors.js";
import { localOnlyWithSecret } from "../middleware/localOnly.js";
import { renderRunHtml } from "../services/renderHtml.js";

export const renderRouter = Router();

/** Internal HTML render route — Puppeteer points at this. 127.0.0.1 + secret only. */
renderRouter.get(
  "/:id",
  localOnlyWithSecret,
  asyncHandler(async (req, res) => {
    const run = await prisma.newsletterRun.findUnique({
      where: { id: req.params.id },
      include: { client: true, template: true },
    });
    if (!run) throw new NotFoundError("Run");
    const html = renderRunHtml({ run, client: run.client, template: run.template });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  }),
);
