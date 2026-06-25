import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { NotFoundError } from "../util/errors.js";
import { parseBody, parseJson } from "../util/validate.js";
import {
  ClientSummaryDtoSchema,
  ClientFullDtoSchema,
  RecurringSectionsSchema,
  MockContentRequestSchema,
  ArticleArraySchema,
  ImageRefArraySchema,
} from "@newsforge/shared";
import { generateMockContent } from "../services/mockContentService.js";

export const clientsRouter = Router();

clientsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.client.findMany({ orderBy: { name: "asc" } });
    const out = rows.map((c) =>
      ClientSummaryDtoSchema.parse({
        id: c.id,
        name: c.name,
        tagline: c.tagline,
        city: c.city,
        careLevel: c.careLevel,
        richnessLevel: c.richnessLevel,
        logoUrl: c.logoUrl,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor,
        accentColor: c.accentColor,
        pageCount: c.pageCount,
      }),
    );
    res.json({ clients: out });
  }),
);

clientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const c = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!c) throw new NotFoundError("Client");
    const dto = ClientFullDtoSchema.parse({
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      city: c.city,
      careLevel: c.careLevel,
      richnessLevel: c.richnessLevel,
      logoUrl: c.logoUrl,
      primaryColor: c.primaryColor,
      secondaryColor: c.secondaryColor,
      accentColor: c.accentColor,
      pageCount: c.pageCount,
      headingFont: c.headingFont,
      bodyFont: c.bodyFont,
      defaultTemplateId: c.defaultTemplateId,
      recurringSections: parseJson(RecurringSectionsSchema, c.recurringSections),
      brandVoice: c.brandVoice,
    });
    res.json({ client: dto });
  }),
);

/** POST /api/clients/:id/mock-content — deterministic per (clientId, monthLabel). */
clientsRouter.post(
  "/:id/mock-content",
  asyncHandler(async (req, res) => {
    const body = parseBody(MockContentRequestSchema, req.body);
    const exists = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!exists) throw new NotFoundError("Client");
    const result = await generateMockContent(req.params.id, body.monthLabel, {
      tone: body.tone,
      density: body.density,
      includeSections: body.includeSections,
    });
    res.json({
      articles: ArticleArraySchema.parse(result.articles),
      images: ImageRefArraySchema.parse(result.images),
    });
  }),
);
