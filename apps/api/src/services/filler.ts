/**
 * Filler service. For each block with needsFiller=true:
 *   - if fillerMode=GENERATE: ask Gemini for on-brand short copy,
 *     fall back to a deterministic placeholder if Gemini fails.
 *   - if fillerMode=PLACEHOLDER: emit a placeholder block marker.
 */
import { createId } from "@paralleldrive/cuid2";
import {
  GeminiFillerResponseSchema,
  type GeminiFillerResponse,
} from "@newsforge/shared/schemas";
import type {
  AssembledLayout,
  Article,
  GridSpec,
  LayoutBlock,
  RecurringSection,
} from "@newsforge/shared/schemas";
import { callGeminiJson } from "../gemini.js";

interface FillerInput {
  layout: AssembledLayout;
  gridSpec: GridSpec;
  recurringSections: RecurringSection[];
  articles: Article[];
  brandVoice: string;
  clientName: string;
  monthLabel: string;
  mode: "GENERATE" | "PLACEHOLDER";
}

interface FillerOutput {
  layout: AssembledLayout;
  articles: Article[];
  usedFallback?: boolean;
  fallbackReason?: string;
}

function placeholderText(slotType: string, clientName: string): string {
  const human = slotType.charAt(0).toUpperCase() + slotType.slice(1);
  return `[Placeholder — ${human} block for ${clientName}. Replace with on-brand content.]`;
}

export async function generateFiller(input: FillerInput): Promise<FillerOutput> {
  const { layout, gridSpec, mode } = input;
  const slotsById = new Map(gridSpec.slots.map((s) => [s.id, s]));

  const fillTargets = layout.blocks.filter((b) => b.needsFiller);
  if (fillTargets.length === 0) {
    return { layout, articles: input.articles };
  }

  if (mode === "PLACEHOLDER") {
    const newBlocks: LayoutBlock[] = layout.blocks.map((b) => {
      if (!b.needsFiller) return b;
      const slot = slotsById.get(b.slotId);
      return {
        ...b,
        kind: "placeholder",
        inlineText: placeholderText(slot?.type ?? "content", input.clientName),
        needsFiller: false,
      };
    });
    return {
      layout: {
        ...layout,
        blocks: newBlocks,
        unfilledSlotIds: [],
        stats: {
          ...layout.stats,
          fillerBlocks: fillTargets.length,
          emptySlots: 0,
        },
      },
      articles: input.articles,
    };
  }

  // GENERATE — ask Gemini for short on-brand copy per slot.
  const slotPrompts = fillTargets.map((b) => {
    const slot = slotsById.get(b.slotId);
    const recurring = input.recurringSections.find(
      (s) => s.id === b.sectionId,
    );
    return {
      slotId: b.slotId,
      slotType: slot?.type ?? "body",
      minWords: slot?.capacity.minWords ?? 80,
      maxWords: slot?.capacity.maxWords ?? 220,
      sectionTitle: recurring?.title,
      sectionDescription: recurring?.description,
    };
  });

  const fallback: GeminiFillerResponse = {
    articles: slotPrompts.map((sp) => ({
      slotId: sp.slotId,
      title: sp.sectionTitle ?? "Community Update",
      body: placeholderText(sp.slotType, input.clientName),
      wordCount: 12,
    })),
  };

  const systemPrompt = [
    `You are a copywriter for ${input.clientName}, a senior-living community.`,
    `Brand voice: ${input.brandVoice}.`,
    `Newsletter month: ${input.monthLabel}.`,
    `For each slot, write a short, on-brand piece of copy that fits the given word range.`,
    `Always respond with valid JSON matching the schema. No prose outside JSON.`,
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      schema: {
        articles: [
          {
            slotId: "string (must match input slotId)",
            title: "short title",
            body: "the copy",
            wordCount: "integer",
          },
        ],
      },
      slots: slotPrompts,
    },
    null,
    2,
  );

  const result = await callGeminiJson<GeminiFillerResponse>({
    schema: GeminiFillerResponseSchema,
    systemPrompt,
    userPrompt,
    fallback,
  });

  // Index returned copy by slotId
  const bySlot = new Map(result.data.articles.map((a) => [a.slotId, a]));

  // Build new articles list + updated blocks
  const newArticles: Article[] = [...input.articles];
  const newBlocks: LayoutBlock[] = layout.blocks.map((b) => {
    if (!b.needsFiller) return b;
    const piece = bySlot.get(b.slotId);
    if (!piece) {
      const slot = slotsById.get(b.slotId);
      return {
        ...b,
        kind: "placeholder",
        inlineText: placeholderText(slot?.type ?? "content", input.clientName),
        needsFiller: false,
      };
    }
    const article: Article = {
      id: createId(),
      title: piece.title,
      body: piece.body,
      wordCount: piece.wordCount,
      isFiller: true,
      source: "GENERATED",
      sectionId: b.sectionId,
    };
    newArticles.push(article);
    return {
      ...b,
      kind: "filler",
      articleId: article.id,
      inlineText: piece.body,
      needsFiller: false,
    };
  });

  return {
    layout: {
      ...layout,
      blocks: newBlocks,
      unfilledSlotIds: [],
      stats: {
        ...layout.stats,
        fillerBlocks: fillTargets.length,
        emptySlots: 0,
      },
    },
    articles: newArticles,
    usedFallback: "usedFallback" in result ? result.usedFallback : undefined,
    fallbackReason:
      "reason" in result ? (result as { reason: string }).reason : undefined,
  };
}
