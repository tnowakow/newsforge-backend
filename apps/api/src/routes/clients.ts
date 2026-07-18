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

const MockContentBody = z.object({}).optional();

clientsRouter.post("/:id/mock-content", async (req, res) => {
  const _body = MockContentBody.safeParse(req.body);
  void _body;

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
  });

  // Tag the first N articles to recurring section ids so the fitter can place them.
  if (recurring.success) {
    for (let i = 0; i < Math.min(recurring.data.length, articles.length); i++) {
      articles[i].sectionId = recurring.data[i].id;
      articles[i].title = recurring.data[i].title;
    }
  }

  res.json({
    clientId: client.id,
    richnessLevel: client.richnessLevel,
    articles,
    images,
    counts: { articles: articles.length, images: images.length },
  });
});
