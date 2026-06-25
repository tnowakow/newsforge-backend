import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { parseJson } from "../util/validate.js";
import {
  TemplateDtoSchema,
  GridSpecSchema,
  TemplateSlotsSchema,
  CompatibilityHintsSchema,
} from "@newsforge/shared";

export const templatesRouter = Router();

templatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.template.findMany({ orderBy: { name: "asc" } });
    const out = rows.map((t) =>
      TemplateDtoSchema.parse({
        id: t.id,
        name: t.name,
        pageCount: t.pageCount,
        gridSpec: parseJson(GridSpecSchema, t.gridSpec),
        slotTypes: parseJson(TemplateSlotsSchema, t.slotTypes),
        compatibilityHints: parseJson(CompatibilityHintsSchema, t.compatibilityHints),
        previewImageUrl: t.previewImageUrl,
      }),
    );
    res.json({ templates: out });
  }),
);
