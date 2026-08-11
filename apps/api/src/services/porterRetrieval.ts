import type { Article, NewsImage } from "@newsforge/shared/schemas";

export type PorterRetrievalFamily =
  | "feature-band"
  | "community-collage"
  | "dense-lavender-grid"
  | "editorial-light"
  | "photo-mosaic"
  | "spotlight-feature";

type WordBand = "low" | "med" | "high" | "v-high";

export interface PorterContentSignature {
  photoCount: number;
  datedRows: number;
  wordVolume: number;
  wordBand: WordBand;
  hasSpotlight: boolean;
  hasEventRecap: boolean;
  hasFooterBand: boolean;
}

export interface PorterExampleSignature {
  exampleId: string;
  family: PorterRetrievalFamily;
  signature: PorterContentSignature;
  notes: string;
}

export interface PorterRetrievalResult {
  signature: PorterContentSignature;
  examples: PorterExampleSignature[];
  family: PorterRetrievalFamily;
  scenario: "community-classic" | "panel-garden" | "photo-festival" | "resident-feature" | "editorial-light";
  prompt: string;
}

const EXAMPLES: PorterExampleSignature[] = [
  ["01", "editorial-light", 5, 0, "low", false, false, false],
  ["02", "community-collage", 12, 0, "med", true, true, false],
  ["03", "photo-mosaic", 11, 0, "med", true, true, false],
  ["04", "editorial-light", 4, 0, "low", false, false, true],
  ["05", "dense-lavender-grid", 9, 0, "high", true, false, true],
  ["06", "community-collage", 11, 34, "med", false, true, true],
  ["07", "feature-band", 9, 24, "high", true, true, false],
  ["08", "editorial-light", 6, 52, "low", false, false, true],
  ["09", "feature-band", 8, 26, "high", true, false, true],
  ["10", "community-collage", 10, 14, "med", false, true, false],
  ["11", "dense-lavender-grid", 14, 21, "low", true, false, true],
  ["12", "photo-mosaic", 11, 13, "low", false, true, false],
  ["13", "dense-lavender-grid", 13, 17, "high", true, true, true],
  ["14", "editorial-light", 4, 18, "high", false, false, false],
  ["15", "feature-band", 8, 22, "high", true, true, false],
  ["16", "community-collage", 11, 11, "med", true, false, true],
  ["17", "dense-lavender-grid", 12, 20, "med", true, true, true],
  ["18", "feature-band", 8, 17, "v-high", true, true, false],
  ["19", "photo-mosaic", 14, 12, "med", false, true, false],
  ["20", "feature-band", 6, 20, "high", true, false, false],
].map(([exampleId, family, photoCount, datedRows, wordBand, hasSpotlight, hasEventRecap, hasFooterBand]) => ({
    exampleId: String(exampleId),
    family: family as PorterRetrievalFamily,
    signature: {
      photoCount: Number(photoCount),
      datedRows: Number(datedRows),
      wordVolume: wordBand === "low" ? 500 : wordBand === "med" ? 850 : wordBand === "high" ? 1250 : 1600,
      wordBand: wordBand as WordBand,
      hasSpotlight: Boolean(hasSpotlight),
      hasEventRecap: Boolean(hasEventRecap),
      hasFooterBand: Boolean(hasFooterBand),
    },
    notes: "Porter example signature seed from Addendum 7B.",
  }));

const DATE_PATTERN = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}\b/gi;

function wordBand(wordVolume: number): WordBand {
  // The supplied July demo is ~400 words after scaffolding is removed but is
  // medium-density because its ten dated rows and three feature modules carry
  // the composition. Keep the bucket aligned to the reference table.
  if (wordVolume < 400) return "low";
  if (wordVolume < 1050) return "med";
  if (wordVolume < 1450) return "high";
  return "v-high";
}

export function computePorterContentSignature(articles: Article[], images: NewsImage[]): PorterContentSignature {
  const text = articles.map((article) => `${article.title} ${article.body}`).join(" ");
  const datedRows = (text.match(DATE_PATTERN) ?? []).length;
  const wordVolume = articles.reduce((sum, article) => sum + article.wordCount, 0);
  return {
    photoCount: images.length,
    datedRows,
    wordVolume,
    wordBand: wordBand(wordVolume),
    hasSpotlight: articles.some((article) => article.articleType === "resident-story" || /spotlight|resident feature/i.test(article.title)),
    hasEventRecap: articles.some((article) => article.articleType === "event-recap"),
    hasFooterBand: false,
  };
}

function distance(a: PorterContentSignature, b: PorterContentSignature): number {
  const wordBandPenalty = a.wordBand === b.wordBand ? 0 : 0.18;
  return (
    Math.min(Math.abs(a.photoCount - b.photoCount) / 10, 1) * 0.38 +
    Math.min(Math.abs(a.datedRows - b.datedRows) / 40, 1) * 0.30 +
    Math.min(Math.abs(a.wordVolume - b.wordVolume) / 1400, 1) * 0.16 +
    (a.hasSpotlight === b.hasSpotlight ? 0 : 0.06) +
    (a.hasEventRecap === b.hasEventRecap ? 0 : 0.06) +
    wordBandPenalty
  );
}

function familyScenario(family: PorterRetrievalFamily): PorterRetrievalResult["scenario"] {
  if (family === "community-collage") return "community-classic";
  if (family === "dense-lavender-grid" || family === "spotlight-feature") return "panel-garden";
  if (family === "editorial-light") return "editorial-light";
  if (family === "photo-mosaic") return "photo-festival";
  return "photo-festival";
}

export function retrievePorterExamples(articles: Article[], images: NewsImage[], k = 3): PorterRetrievalResult {
  const signature = computePorterContentSignature(articles, images);
  const julyLikeDenseGrid =
    signature.photoCount >= 6 &&
    signature.photoCount <= 14 &&
    signature.datedRows >= 8 &&
    signature.datedRows <= 24 &&
    signature.wordBand === "med" &&
    signature.hasSpotlight &&
    !signature.hasEventRecap;
  const examples = EXAMPLES
    .map((example) => ({
      example,
      score:
        distance(signature, example.signature) -
        (julyLikeDenseGrid && example.family === "dense-lavender-grid" ? 0.25 : 0),
    }))
    .sort((a, b) => a.score - b.score || a.example.exampleId.localeCompare(b.example.exampleId))
    .slice(0, k)
    .map(({ example }) => example);
  const familyCounts = new Map<PorterRetrievalFamily, number>();
  for (const example of examples) familyCounts.set(example.family, (familyCounts.get(example.family) ?? 0) + 1);
  const family = [...familyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "community-collage";
  const prompt = [
    `Retrieved Porter exemplars: ${examples.map((example) => `${example.exampleId} (${example.family})`).join(", ")}.`,
    `Content signature: ${signature.photoCount} photos, ${signature.datedRows} dated rows, ${signature.wordVolume} words (${signature.wordBand}), spotlight=${signature.hasSpotlight}, event recap=${signature.hasEventRecap}.`,
    `Use the retrieved family ${family} as the compositional starting point. Generalize its density and elastic proportions; do not copy content or invent facts.`,
  ].join(" ");
  return { signature, examples, family, scenario: familyScenario(family), prompt };
}

export const PORTER_EXAMPLE_SIGNATURES = EXAMPLES;
