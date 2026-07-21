import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { generateMockContent } from "../services/mockContent.js";
import {
  RecurringSectionsSchema,
} from "@newsforge/shared/schemas";

export const clientsRouter: Router = Router();

clientsRouter.get("/", async (_req, res) => {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      tagline: true,
      richnessLevel: true,
      logoUrl: true,
      primaryColor: true,
      pageCount: true,
    },
    orderBy: { name: "asc" },
  });
  res.json({ clients });
});

clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { defaultTemplate: true },
  });
  if (!client) {
    res.status(404).json({ error: "client_not_found" });
    return;
  }
  res.json({ client });
});

const MockContentBody = z
  .object({
    month: z.string().min(1).optional(),
    tone: z.enum(["warm", "formal", "playful", "civic"]).optional(),
    density: z.number().int().min(1).max(4).optional(),
    include: z.array(z.string()).optional(),
  })
  .optional();

clientsRouter.post("/:id/mock-content", async (req, res) => {
  const parsed = MockContentBody.safeParse(req.body);
  const body = parsed.success ? parsed.data : undefined;

  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
  });
  if (!client) {
    res.status(404).json({ error: "client_not_found" });
    return;
  }

  const recurring = RecurringSectionsSchema.safeParse(client.recurringSections);

  const { articles, images } = await generateMockContent({
    richness: client.richnessLevel,
    careLevel: client.careLevel,
    brandVoice: client.brandVoice,
    clientName: client.name,
    city: client.city,
    monthLabel: body?.month,
    tone: body?.tone,
    density: body?.density,
    include: body?.include,
    recurringSections: recurring.success ? recurring.data : [],
  });

  res.json({
    clientId: client.id,
    richnessLevel: client.richnessLevel,
    articles,
    images,
    counts: { articles: articles.length, images: images.length },
  });
});
