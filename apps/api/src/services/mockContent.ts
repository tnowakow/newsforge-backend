/**
 * Deterministic mock-content generator. Volume varies by client richness:
 *   SIMPLE      ->  2-3 articles, 4 images
 *   MODERATE    ->  4-5 articles, 7 images
 *   RICH        ->  6-7 articles, 11 images
 *   EXTRA_RICH  ->  8-10 articles, 15-20 images
 *
 * Tone varies by brandVoice (passed as a hint string) and careLevel.
 */
import { createId } from "@paralleldrive/cuid2";
import type { Article, NewsImage } from "@newsforge/shared/schemas";
import type {
  Richness,
  CareLevel,
} from "@newsforge/shared/schemas";

const SEED_TITLES = [
  "A Note From the Director",
  "Welcome to Our Newest Neighbors",
  "Resident Spotlight",
  "This Month in the Garden",
  "Birthdays & Anniversaries",
  "Activities Calendar Preview",
  "From the Kitchen",
  "Wellness Corner",
  "Volunteer of the Month",
  "Trips & Outings",
  "Memory Lane: A Look Back",
  "Family Engagement",
  "Staff Appreciation",
  "Community Partners",
  "Photo of the Month",
];

const BODY_SEED = {
  warm:
    "It is hard to believe how quickly the season has turned. The mornings carry a softness now, and our community gathered on the porch this week to share coffee, stories, and the kind of easy laughter that reminds us why this place feels like home.",
  upbeat:
    "What a month it has been! From bingo to brunch, from movie nights to a surprise visit from a local school choir, energy has been high and smiles have been everywhere. Read on for everything coming up.",
  gentle:
    "We continue to focus on small, comforting routines that bring our residents joy. Quiet mornings with music, afternoon walks in the courtyard, and familiar faces sharing favorite memories together.",
  formal:
    "We are pleased to share an update on community activities, resident wellness initiatives, and the calendar of events for the month ahead. Thank you to our dedicated team and family members for your continued partnership.",
};

function pickVoice(brandVoice: string): keyof typeof BODY_SEED {
  const v = brandVoice.toLowerCase();
  if (v.includes("warm") || v.includes("home")) return "warm";
  if (v.includes("upbeat") || v.includes("lively") || v.includes("fun")) return "upbeat";
  if (v.includes("gentle") || v.includes("calm") || v.includes("memory")) return "gentle";
  return "formal";
}

function paragraphsFor(voice: keyof typeof BODY_SEED, paragraphs: number): string {
  const base = BODY_SEED[voice];
  const variants = [
    base,
    "We continue to invest in the small touches that make daily life richer — fresh flowers in the dining room, new hobby kits in the activity center, and a renewed schedule of off-site outings.",
    "Several residents have shared how meaningful these gatherings have been, and we are deeply grateful to the staff and volunteers who make them possible.",
    "Looking ahead, please mark your calendars for the events listed in the back of this newsletter — and don't hesitate to drop by the front desk if you have ideas to share.",
    "Photos from recent events are posted on the family bulletin board and shared in our weekly update email.",
  ];
  return Array.from({ length: paragraphs })
    .map((_, i) => variants[i % variants.length])
    .join("\n\n");
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function targetForRichness(richness: Richness): {
  articles: number;
  images: number;
  paragraphsPerArticle: number;
} {
  switch (richness) {
    case "SIMPLE":
      return { articles: 3, images: 4, paragraphsPerArticle: 2 };
    case "MODERATE":
      return { articles: 5, images: 7, paragraphsPerArticle: 3 };
    case "RICH":
      return { articles: 7, images: 11, paragraphsPerArticle: 4 };
    case "EXTRA_RICH":
      return { articles: 10, images: 18, paragraphsPerArticle: 5 };
  }
}

function careLevelFlavor(care: CareLevel): string {
  switch (care) {
    case "INDEPENDENT_LIVING":
      return " Independent living residents are invited to sign up at the front desk.";
    case "ASSISTED_LIVING":
      return " Care partners are happy to help with sign-ups and reminders.";
    case "MEMORY_CARE":
      return " Caregivers will accompany residents to ensure a comfortable experience.";
    case "MIXED":
      return " Activities are open across all neighborhoods in our community.";
  }
}

const IMAGE_HOSTS = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba",
  "https://images.unsplash.com/photo-1518770660439-4636190af475",
  "https://images.unsplash.com/photo-1503676260728-1c00da094a0b",
  "https://images.unsplash.com/photo-1493612276216-ee3925520721",
];

const ASPECTS: NewsImage["aspect"][] = ["landscape", "portrait", "square"];

export interface GenerateMockContentInput {
  richness: Richness;
  careLevel: CareLevel;
  brandVoice: string;
}

export interface GenerateMockContentResult {
  articles: Article[];
  images: NewsImage[];
}

export function generateMockContent(
  input: GenerateMockContentInput,
): GenerateMockContentResult {
  const { richness, careLevel, brandVoice } = input;
  const target = targetForRichness(richness);
  const voice = pickVoice(brandVoice);

  const articles: Article[] = [];
  for (let i = 0; i < target.articles; i++) {
    const title = SEED_TITLES[i % SEED_TITLES.length];
    const body = paragraphsFor(voice, target.paragraphsPerArticle) +
      careLevelFlavor(careLevel);
    articles.push({
      id: createId(),
      title,
      body,
      wordCount: wordCount(body),
      byline: i === 0 ? "From the Executive Director" : undefined,
      isFiller: false,
      source: "MOCK",
    });
  }

  const images: NewsImage[] = [];
  for (let i = 0; i < target.images; i++) {
    const host = IMAGE_HOSTS[i % IMAGE_HOSTS.length];
    images.push({
      id: createId(),
      url: `${host}?auto=format&fit=crop&w=1200&q=70&sig=${i}`,
      caption: i === 0 ? "Residents enjoying the courtyard" : undefined,
      alt: "Community moment",
      aspect: ASPECTS[i % ASPECTS.length],
      isPlaceholder: false,
      source: "MOCK",
    });
  }

  return { articles, images };
}
