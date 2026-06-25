import { prisma } from "../db.js";
import { log } from "../logger.js";
import { callGeminiForFillerCopy, GeminiError } from "./geminiService.js";
import { parseJson } from "../util/validate.js";
import {
  AssembledLayoutSchema,
  type AssembledLayout,
  type LayoutBlock,
} from "@newsforge/shared";

/**
 * Generates short on-brand filler copy for any block whose contentRef is a placeholder.
 * Falls back to the global filler pool (AssetLibrary where clientId IS NULL) if Gemini fails.
 */

function placeholderBlocks(layout: AssembledLayout): Array<{
  pageNumber: number;
  block: LayoutBlock;
}> {
  const out: Array<{ pageNumber: number; block: LayoutBlock }> = [];
  for (const page of layout.pages) {
    for (const block of page.blocks) {
      if (block.contentRef.kind === "placeholder") out.push({ pageNumber: page.pageNumber, block });
    }
  }
  return out;
}

async function fallbackPool(): Promise<string[]> {
  const rows = await prisma.assetLibrary.findMany({
    where: { clientId: null, type: "ARTICLE", source: "MOCK" },
    take: 8,
  });
  return rows.map((r) => r.contentOrUrl);
}

function buildFillerPrompt(brandVoice: string, brandColors: string[], block: LayoutBlock): string {
  return [
    `Write ONE short on-brand newsletter snippet for a senior-living community.`,
    `Brand voice: ${brandVoice}`,
    `Palette hint: ${brandColors.join(", ")}.`,
    `Block type: ${block.type}.`,
    `Constraints: 2–4 sentences, warm, community-focused, no emojis, no exclamation marks, no invented resident names, no specific dates.`,
    `Return only the snippet text — no preamble.`,
  ].join("\n");
}

export async function generateFiller(runId: string): Promise<{
  status: "applied" | "fallback";
  layout: AssembledLayout;
  blocksFilled: number;
}> {
  const run = await prisma.newsletterRun.findUnique({
    where: { id: runId },
    include: { client: true },
  });
  if (!run) throw new Error(`Run not found: ${runId}`);
  const layout = parseJson(AssembledLayoutSchema, run.assembledLayout);

  if (run.fillerMode === "PLACEHOLDER") {
    // Vitaly §6.5: still honor the user's choice; mark filler clearly without calling Gemini.
    let count = 0;
    for (const { block } of placeholderBlocks(layout)) {
      block.contentRef = {
        kind: "placeholder",
        inline: { caption: `Placeholder — ${block.type} (content TBD)` },
      };
      count++;
    }
    await persist(runId, layout);
    return { status: "applied", layout, blocksFilled: count };
  }

  const targets = placeholderBlocks(layout);
  if (targets.length === 0) {
    return { status: "applied", layout, blocksFilled: 0 };
  }

  let status: "applied" | "fallback" = "applied";
  const brandColors = [run.client.primaryColor, run.client.secondaryColor, run.client.accentColor];
  const pool = await fallbackPool();
  let poolCursor = 0;
  const pickPool = () => (pool.length === 0 ? "A note from our community team." : pool[poolCursor++ % pool.length]!);

  // Bounded concurrency — keep within Gemini quota and the 7s budget.
  const MAX_GEN = Math.min(targets.length, 8);
  for (let i = 0; i < targets.length; i++) {
    const { block } = targets[i]!;
    if (i >= MAX_GEN) {
      // Beyond the gen budget: use pool.
      const text = pickPool();
      block.contentRef = { kind: "placeholder", inline: makeInline(block, text) };
      continue;
    }
    try {
      const { value, ms } = await callGeminiForFillerCopy(buildFillerPrompt(run.client.brandVoice, brandColors, block));
      const cleaned = (value as string).trim();
      block.contentRef = { kind: "placeholder", inline: makeInline(block, cleaned) };
      log.info("gemini_filler_ok", { runId, blockId: block.id, ms });
    } catch (e) {
      status = "fallback";
      const text = pickPool();
      block.contentRef = { kind: "placeholder", inline: makeInline(block, text) };
      log.warn("gemini_filler_fallback", {
        runId,
        blockId: block.id,
        err: e instanceof GeminiError ? e.message : String(e),
      });
    }
  }

  await persist(runId, layout);
  return { status, layout, blocksFilled: targets.length };
}

function makeInline(block: LayoutBlock, text: string): { title?: string; body?: string; caption?: string } {
  switch (block.type) {
    case "headline":
      return { title: text.split("\n")[0]!.slice(0, 80) };
    case "image":
    case "gallery":
      return { caption: text.split("\n")[0]!.slice(0, 140) };
    case "footer":
    case "masthead":
      return { caption: text.split("\n")[0]!.slice(0, 100) };
    default:
      return { body: text };
  }
}

async function persist(runId: string, layout: AssembledLayout): Promise<void> {
  await prisma.newsletterRun.update({
    where: { id: runId },
    data: {
      assembledLayout: AssembledLayoutSchema.parse(layout) as never,
      layoutVersion: { increment: 1 },
      pdfPath: null,
      pdfGeneratedAt: null,
    },
  });
}
