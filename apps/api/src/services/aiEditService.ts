import { prisma } from "../db.js";
import { log } from "../logger.js";
import { callGeminiForAiEdit, GeminiError } from "./geminiService.js";
import { parseJson } from "../util/validate.js";
import {
  AssembledLayoutSchema,
  AiEditResponseSchema,
  type AiEditResponse,
  type AssembledLayout,
  type LayoutBlock,
  type LayoutPage,
} from "@newsforge/shared";

interface AiEditResult {
  status: "applied" | "fallback";
  prompt: string;
  layout: AssembledLayout;
  summary: string;
  geminiLatency: number | null;
  diff: { movedBlocks: number; swappedBlocks: number; addedBlocks: number; replacedText: number };
  aiEditId: string;
}

function buildPrompt(layout: AssembledLayout, userPrompt: string): string {
  // Provide a compact, structured serialization the model can edit.
  const compact = layout.pages.map((p) => ({
    pageNumber: p.pageNumber,
    blocks: p.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      contentKind: b.contentRef.kind,
    })),
  }));
  return [
    `You are NewsForge's layout assistant. Apply the user's request as a list of layout operations.`,
    `Allowed ops: "move" (x,y), "resize" (w,h), "swap-blocks" (blockIdA,blockIdB), "replace-text" (title/body/caption).`,
    `Stay within the existing pages. Only reference block ids that exist. Return JSON: { "summary": string, "ops": [...] }.`,
    `User request: """${userPrompt.slice(0, 1500)}"""`,
    `Current layout (compact):`,
    JSON.stringify({ schemaVersion: 1, pages: compact }),
  ].join("\n");
}

function applyOps(layout: AssembledLayout, ops: AiEditResponse["ops"]): {
  layout: AssembledLayout;
  diff: AiEditResult["diff"];
} {
  // Defensive clone.
  const next: AssembledLayout = JSON.parse(JSON.stringify(layout));
  const diff = { movedBlocks: 0, swappedBlocks: 0, addedBlocks: 0, replacedText: 0 };

  const findBlock = (page: LayoutPage, id: string): LayoutBlock | undefined =>
    page.blocks.find((b) => b.id === id);
  const findPage = (pageNumber: number): LayoutPage | undefined =>
    next.pages.find((p) => p.pageNumber === pageNumber);

  for (const op of ops) {
    const page = findPage(op.pageNumber);
    if (!page) continue;
    switch (op.op) {
      case "move": {
        const b = findBlock(page, op.blockId);
        if (b) {
          b.x = clamp(op.x, 0, page.template.gridCols - 1);
          b.y = clamp(op.y, 0, page.template.gridRows - 1);
          diff.movedBlocks++;
        }
        break;
      }
      case "resize": {
        const b = findBlock(page, op.blockId);
        if (b) {
          b.w = clamp(op.w, 1, page.template.gridCols);
          b.h = clamp(op.h, 1, page.template.gridRows);
          diff.movedBlocks++;
        }
        break;
      }
      case "swap-blocks": {
        const a = findBlock(page, op.blockIdA);
        const c = findBlock(page, op.blockIdB);
        if (a && c) {
          const tmp = { x: a.x, y: a.y, w: a.w, h: a.h };
          a.x = c.x;
          a.y = c.y;
          a.w = c.w;
          a.h = c.h;
          c.x = tmp.x;
          c.y = tmp.y;
          c.w = tmp.w;
          c.h = tmp.h;
          diff.swappedBlocks++;
        }
        break;
      }
      case "replace-text": {
        const b = findBlock(page, op.blockId);
        if (b) {
          b.contentRef = {
            kind: "placeholder",
            inline: {
              title: op.title ?? b.contentRef.inline?.title,
              body: op.body ?? b.contentRef.inline?.body,
              caption: op.caption ?? b.contentRef.inline?.caption,
            },
          };
          diff.replacedText++;
        }
        break;
      }
    }
  }
  return { layout: AssembledLayoutSchema.parse(next), diff };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic fallback (Vitaly §3 / Sofia Screen 6 State D). */
function fallbackReshuffle(layout: AssembledLayout): {
  layout: AssembledLayout;
  diff: AiEditResult["diff"];
} {
  const next: AssembledLayout = JSON.parse(JSON.stringify(layout));
  const diff = { movedBlocks: 0, swappedBlocks: 0, addedBlocks: 0, replacedText: 0 };
  for (const page of next.pages) {
    // Swap two filler/body blocks if available.
    const candidates = page.blocks.filter(
      (b) => b.type === "body" || b.type === "sidebar" || b.type === "image",
    );
    if (candidates.length >= 2) {
      const a = candidates[0]!;
      const b = candidates[1]!;
      const tmp = { x: a.x, y: a.y, w: a.w, h: a.h };
      a.x = b.x;
      a.y = b.y;
      a.w = b.w;
      a.h = b.h;
      b.x = tmp.x;
      b.y = tmp.y;
      b.w = tmp.w;
      b.h = tmp.h;
      diff.swappedBlocks++;
    }
  }
  return { layout: AssembledLayoutSchema.parse(next), diff };
}

export async function applyAiEdit(runId: string, prompt: string): Promise<AiEditResult> {
  const run = await prisma.newsletterRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run not found: ${runId}`);
  const layoutBefore = parseJson(AssembledLayoutSchema, run.assembledLayout);

  let next: AssembledLayout = layoutBefore;
  let summary = "";
  let geminiLatency: number | null = null;
  let status: "applied" | "fallback" = "fallback";
  let diff: AiEditResult["diff"] = { movedBlocks: 0, swappedBlocks: 0, addedBlocks: 0, replacedText: 0 };

  try {
    const { value, ms } = await callGeminiForAiEdit(
      buildPrompt(layoutBefore, prompt),
      AiEditResponseSchema,
    );
    geminiLatency = ms;
    const applied = applyOps(layoutBefore, value.ops);
    next = applied.layout;
    diff = applied.diff;
    summary = value.summary;
    status = "applied";
    log.info("gemini_ai_edit_applied", { runId, ms, ops: value.ops.length });
  } catch (e) {
    log.warn("gemini_ai_edit_fallback", { runId, err: e instanceof GeminiError ? e.message : String(e) });
    const fb = fallbackReshuffle(layoutBefore);
    next = fb.layout;
    diff = fb.diff;
    summary = "Fallback reshuffle applied (Gemini unavailable).";
  }

  const updated = await prisma.$transaction(async (tx) => {
    const edit = await tx.aiEdit.create({
      data: {
        runId,
        prompt,
        resultStatus: status,
        diffSummary: diff,
        layoutBefore: layoutBefore as never,
        layoutAfter: next as never,
        geminiLatency,
      },
    });
    await tx.newsletterRun.update({
      where: { id: runId },
      data: {
        assembledLayout: next as never,
        layoutVersion: { increment: 1 },
        // PDF cache is now stale.
        pdfPath: null,
        pdfGeneratedAt: null,
      },
    });
    return edit;
  });

  return {
    status,
    prompt,
    layout: next,
    summary,
    geminiLatency,
    diff,
    aiEditId: updated.id,
  };
}
