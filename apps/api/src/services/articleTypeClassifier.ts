/**
 * articleTypeClassifier — Gemini Flash single-shot classifier with
 * deterministic keyword fallback. Never throws (Vitaly rule 1 + rule 13).
 */
import { z } from "zod";
import {
  ArticleTypeSchema,
  type ArticleType,
} from "@newsforge/shared/schemas";
import { callGeminiJson } from "../gemini.js";

export interface ClassifierInput {
  title: string;
  body: string;
  wordCount: number;
}

export interface ClassifierResult {
  articleType: ArticleType;
  confidence: number;
  source: "gemini" | "heuristic";
}

const GeminiClassifierResponseSchema = z.object({
  articleType: ArticleTypeSchema,
  confidence: z.number().min(0).max(1),
});

const KEYWORDS: Array<{ type: ArticleType; patterns: RegExp[] }> = [
  {
    type: "birthday",
    patterns: [/\bbirthdays?\b/i, /\bbday\b/i, /\bturning\s+\d{2}\b/i],
  },
  {
    type: "executive-note",
    patterns: [
      /\bfrom the (?:executive )?director\b/i,
      /\bdirector'?s? (?:corner|note|letter)\b/i,
      /\ba note from\b/i,
      /\byours in service\b/i,
    ],
  },
  {
    type: "event-recap",
    patterns: [
      /\brecap\b/i,
      /\blast (?:week|month|friday|saturday)\b/i,
      /\bwhat a (?:great|beautiful|wonderful)\b/i,
      /\bwas a (?:hit|success|blast)\b/i,
    ],
  },
  {
    type: "announcement",
    patterns: [
      /\bwe(?:'| ?a)re (?:excited|pleased|happy) to (?:announce|share|launch)\b/i,
      /\bnew program\b/i,
      /\bsave the date\b/i,
      /\bwelcome\b.*\bteam\b/i,
    ],
  },
  {
    type: "resident-story",
    patterns: [
      /\bmeet (?:our resident|resident)\b/i,
      /\bresident spotlight\b/i,
      /\bfor over \d+ years\b/i,
      /\bshe (?:remembers|recalls)\b|\bhe (?:remembers|recalls)\b/i,
    ],
  },
];

export function classifyArticleHeuristic(
  input: ClassifierInput,
): ClassifierResult {
  const haystack = `${input.title}\n${input.body}`;
  for (const { type, patterns } of KEYWORDS) {
    if (patterns.some((r) => r.test(haystack))) {
      return { articleType: type, confidence: 0.4, source: "heuristic" };
    }
  }
  return { articleType: "other", confidence: 0.2, source: "heuristic" };
}

export async function classifyArticleType(
  input: ClassifierInput,
): Promise<ClassifierResult> {
  const heuristic = classifyArticleHeuristic(input);

  const systemPrompt =
    "You classify short senior-living newsletter articles into exactly one of: " +
    "resident-story, event-recap, announcement, birthday, executive-note, other. " +
    'Respond with JSON only: { "articleType": "<one of above>", "confidence": <0-1> }.';

  const userPrompt = JSON.stringify({
    title: input.title,
    body: input.body.slice(0, 4000),
    wordCount: input.wordCount,
  });

  const result = await callGeminiJson({
    schema: GeminiClassifierResponseSchema,
    systemPrompt,
    userPrompt,
    fallback: {
      articleType: heuristic.articleType,
      confidence: heuristic.confidence,
    },
  });

  if ("usedFallback" in result && result.usedFallback) {
    return heuristic;
  }
  return {
    articleType: result.data.articleType,
    confidence: result.data.confidence,
    source: "gemini",
  };
}

/**
 * Convenience: classify a batch in parallel with per-item error insulation.
 */
export async function classifyArticles(
  inputs: ClassifierInput[],
): Promise<ClassifierResult[]> {
  return Promise.all(
    inputs.map(async (i) => {
      try {
        return await classifyArticleType(i);
      } catch {
        return classifyArticleHeuristic(i);
      }
    }),
  );
}
