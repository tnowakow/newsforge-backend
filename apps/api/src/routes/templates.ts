import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";

export const templatesRouter: Router = Router();

templatesRouter.get("/", async (_req, res) => {
  const templates = await prisma.template.findMany({
    orderBy: { name: "asc" },
  });
  res.json({ templates });
});

// ---- v2 addition: generic submission-template.docx download ----
// Vitaly §4.5. Streams a committed asset from src/assets/. Static file, so
// public + long cache is safe.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// When built, __dirname is dist/routes → asset lives at ../../src/assets in
// dev but is copied to dist/assets at build via `tsc --resourceDir` alt.
// To avoid a build-time copy step, resolve from the repo layout in both
// contexts by walking up until we find src/assets/ or dist/assets/.
function resolveSubmissionTemplatePath(): string | null {
  const candidates = [
    // dev: apps/api/src/routes/templates.ts loaded via tsx → __dirname = src/routes
    path.resolve(__dirname, "..", "assets", "submission-template.docx"),
    // built: apps/api/dist/routes/templates.js → __dirname = dist/routes → try ../../src/assets
    path.resolve(__dirname, "..", "..", "src", "assets", "submission-template.docx"),
    // safety: apps/api root
    path.resolve(process.cwd(), "src", "assets", "submission-template.docx"),
    path.resolve(process.cwd(), "apps", "api", "src", "assets", "submission-template.docx"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

templatesRouter.get("/submission-template.docx", (_req, res) => {
  const p = resolveSubmissionTemplatePath();
  if (!p) {
    res.status(500).json({ error: "submission_template_missing" });
    return;
  }
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="newsforge-submission-template.docx"',
  );
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(p).pipe(res);
});

templatesRouter.get("/:id", async (req, res) => {
  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
  });
  if (!template) {
    res.status(404).json({ error: "template_not_found" });
    return;
  }
  res.json({ template });
});
