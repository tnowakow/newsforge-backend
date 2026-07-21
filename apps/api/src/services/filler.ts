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
    const range = wordRangeForSlot(
      slot?.type ?? "body",
      slot?.capacity.minWords,
      slot?.capacity.maxWords,
    );
    return {
      slotId: b.slotId,
      slotType: slot?.type ?? "body",
      minWords: range.minWords,
      maxWords: range.maxWords,
      sectionTitle: recurring?.title,
      sectionDescription: recurring?.description,
      editorialGoal: editorialGoalForSlot(slot?.type ?? "body"),
    };
  });

  const fallback: GeminiFillerResponse = {
    articles: slotPrompts.map((sp) => ({
      slotId: sp.slotId,
      title: sp.sectionTitle ?? fallbackTitle(sp.slotType),
      body: fallbackCopy({
        slotType: sp.slotType,
        clientName: input.clientName,
        monthLabel: input.monthLabel,
        minWords: sp.minWords,
        maxWords: sp.maxWords,
        sectionTitle: sp.sectionTitle,
      }),
      wordCount: 0,
    })),
  };
  fallback.articles = fallback.articles.map((article) => ({
    ...article,
    wordCount: wordCount(article.body),
  }));

  const systemPrompt = [
    `You are the senior editor for ${input.clientName}, a senior-living community newsletter read by residents, families, prospects, and team members.`,
    `Brand voice: ${input.brandVoice}.`,
    `Newsletter month: ${input.monthLabel}.`,
    `Write polished community journalism with a specific lead, varied sentence rhythm, short paragraphs, and a warm human point of view.`,
    `Give each item a concrete 3-8 word headline; avoid generic titles such as Community Update unless the requested section requires it.`,
    `Stay inside every minWords/maxWords range because the copy is going directly into a fixed print layout.`,
    `Do not invent resident or staff names, medical details, quotations, awards, dates, times, or promises. When source facts are missing, use evergreen language and clearly direct readers to the posted calendar or community team for details.`,
    `Avoid cliches and marketing filler, including vibrant, nestled, something for everyone, exciting news, and read on. Do not repeat the same opening or closing across slots.`,
    `Use respectful person-first language. Never sound clinical, childish, or patronizing.`,
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
      existingHeadlines: input.articles.map((article) => article.title),
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

function wordRangeForSlot(
  slotType: string,
  configuredMin?: number,
  configuredMax?: number,
): { minWords: number; maxWords: number } {
  const defaults: Record<string, { minWords: number; maxWords: number }> = {
    headline: { minWords: 4, maxWords: 12 },
    sidebar: { minWords: 30, maxWords: 100 },
    calendar: { minWords: 60, maxWords: 180 },
    spotlight: { minWords: 140, maxWords: 280 },
    body: { minWords: 100, maxWords: 220 },
    filler: { minWords: 40, maxWords: 120 },
  };
  const fallback = defaults[slotType] ?? defaults.body;
  const maxWords = configuredMax ?? fallback.maxWords;
  const minWords = Math.min(configuredMin ?? fallback.minWords, maxWords);
  return { minWords, maxWords };
}

function editorialGoalForSlot(slotType: string): string {
  return {
    headline: "A concise headline/deck that can stand alone; no paragraph-length setup.",
    sidebar: "A scannable service item, milestone note, callout, or practical reminder.",
    calendar: "A compact preview grouped by theme; do not fabricate dates or times.",
    spotlight: "A human-centered feature with a strong lead and one clear takeaway.",
    body: "A complete short article with a concrete opening and useful closing detail.",
    filler: "A brief evergreen community note that adds variety without invented facts.",
  }[slotType] ?? "A concise, useful community-news item.";
}

function fallbackTitle(slotType: string): string {
  return {
    headline: "Around Campus",
    sidebar: "Worth Noting",
    calendar: "This Month at a Glance",
    spotlight: "Community Spotlight",
    body: "Campus Life This Month",
    filler: "A Good Month Ahead",
  }[slotType] ?? "Community Note";
}

function fallbackCopy(input: {
  slotType: string;
  clientName: string;
  monthLabel: string;
  minWords: number;
  maxWords: number;
  sectionTitle?: string;
}): string {
  const base = {
    headline:
      "A month of familiar rhythms, shared meals, family visits, and small celebrations across campus.",
    sidebar:
      "Keep an eye on the posted calendar and community boards for final times, sign-ups, and gathering locations. Families are welcome to check with the life-enrichment team before planning a visit around a favorite activity.",
    calendar:
      `The ${input.monthLabel} calendar includes music, creative programs, wellness time, outdoor visits when weather allows, and relaxed neighborhood gatherings. Final dates and room locations will stay on the posted activity calendar so residents and families can plan around the events they enjoy most.`,
    spotlight:
      `At ${input.clientName}, the best moments often begin with something simple: a familiar song, a favorite dessert, a porch conversation, or a neighbor pulling up an extra chair. Those daily rhythms help residents feel known, and they give families more ways to stay connected throughout the month.`,
    body:
      `This month brings a steady mix of community favorites: live music, seasonal meals, wellness activities, family visits, and quiet moments for conversation. The goal is not to keep every hour busy. It is to make each day feel personal, familiar, and worth looking forward to. Residents can join a group program, spend time outside, or enjoy a slower routine with support from the team.`,
    filler:
      `Thank you to the residents, families, and team members who make this community feel warm in ordinary ways. A kind greeting, a saved seat, or a shared story can change the whole tone of a day.`,
  }[input.slotType] ?? `There is always something meaningful happening at ${input.clientName}, from familiar routines to new memories made with neighbors, families, and team members.`;

  const sentences = base.match(/[^.!?]+[.!?]+/g) ?? [base];
  let copy = base;
  while (wordCount(copy) < input.minWords && wordCount(copy) < input.maxWords) {
    copy = `${copy} ${sentences[wordCount(copy) % sentences.length].trim()}`;
  }
  return copy;
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
