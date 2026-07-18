/**
 * Mock-content generator. Volume varies by client richness:
 *   SIMPLE      ->  2-3 articles, 4 images
 *   MODERATE    ->  4-5 articles, 7 images
 *   RICH        ->  6-7 articles, 11 images
 *   EXTRA_RICH  ->  8-10 articles, 15-20 images
 *
 * Tone varies by brandVoice (passed as a hint string) and careLevel.
 *
 * Each article body is generated via Gemini to match its title and brand voice.
 * Falls back to deterministic placeholder text if Gemini is unavailable.
 */
import { createId } from "@paralleldrive/cuid2";
import type { Article, NewsImage } from "@newsforge/shared/schemas";
import type {
  Richness,
  CareLevel,
} from "@newsforge/shared/schemas";
import {
  GeminiMockResponseSchema,
  type GeminiMockResponse,
} from "@newsforge/shared/schemas";
import { callGeminiJson } from "../gemini.js";

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

/**
 * Deterministic fallback bodies — one per seed title.
 * Used when Gemini is unavailable or times out.
 */
const FALLBACK_BODIES: Record<string, string> = {
  "A Note From the Director":
    "It has been a wonderful month here at our community. We continue to focus on creating meaningful connections and providing the highest quality of care for every resident. Thank you to our dedicated staff and the families who trust us.",
  "Welcome to Our Newest Neighbors":
    "We are thrilled to welcome our newest residents to the community! Please join us in making them feel at home. Stop by the front desk to learn more about how you can help them settle in.",
  "Resident Spotlight":
    "This month we are shining a light on one of our cherished residents. Their story, spirit, and contributions to our community continue to inspire everyone around them.",
  "This Month in the Garden":
    "Our gardens are blooming beautifully this season. Residents have been tending to flower beds, harvesting vegetables, and enjoying peaceful afternoons outdoors among the greenery.",
  "Birthdays & Anniversaries":
    "We are celebrating several special birthdays and anniversaries this month. Please help us make these milestones extra special by sharing a card, a smile, or a song with those being honored.",
  "Activities Calendar Preview":
    "Mark your calendars for an exciting lineup of activities coming up this month. From social gatherings to wellness programs, there is something for everyone to enjoy.",
  "From the Kitchen":
    "Our culinary team has prepared a delicious menu this month featuring seasonal ingredients and resident favorites. We invite you to try something new and share your feedback with our chefs.",
  "Wellness Corner":
    "Staying active and well is a priority for all of us. This month we are highlighting simple wellness practices, from gentle stretches to mindfulness exercises, that residents can incorporate into their daily routine.",
  "Volunteer of the Month":
    "We are proud to recognize this month's volunteer of the month for their dedication and kindness. Their efforts make a real difference in the lives of our residents and staff.",
  "Trips & Outings":
    "Our upcoming trips and outings offer wonderful opportunities for residents to explore new places and create lasting memories. Check the schedule and sign up at the front desk.",
  "Memory Lane: A Look Back":
    "Take a trip down memory lane as we look back at some of the most cherished moments from our community's history. These stories remind us of the rich traditions that make our community special.",
  "Family Engagement":
    "Families are the heart of our community. We encourage continued involvement through visits, shared meals, and participation in community events. Your presence makes all the difference.",
  "Staff Appreciation":
    "Our staff members work tirelessly to ensure every resident feels valued and cared for. This month we want to take a moment to thank them for their compassion, professionalism, and dedication.",
  "Community Partners":
    "We are grateful for the organizations and individuals who partner with us to enhance the quality of life for our residents. Their support and collaboration make our community stronger.",
  "Photo of the Month":
    "This month's photo captures a beautiful moment in our community. It reminds us of the joy, connection, and warmth that fill our halls every day.",
};

const FALLBACK_BODIES_DEFAULT =
  "We are pleased to share updates on community activities, resident wellness, and the calendar of events for the month ahead. Thank you to our dedicated team and family members for your continued partnership.";

function pickVoice(brandVoice: string): string {
  const v = brandVoice.toLowerCase();
  if (v.includes("warm") || v.includes("home")) return "warm and homey";
  if (v.includes("upbeat") || v.includes("lively") || v.includes("fun")) return "upbeat and lively";
  if (v.includes("gentle") || v.includes("calm") || v.includes("memory")) return "gentle and comforting";
  return "professional and respectful";
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function targetForRichness(richness: Richness): {
  articles: number;
  images: number;
  targetWords: number;
} {
  switch (richness) {
    case "SIMPLE":
      return { articles: 3, images: 4, targetWords: 100 };
    case "MODERATE":
      return { articles: 5, images: 7, targetWords: 140 };
    case "RICH":
      return { articles: 7, images: 11, targetWords: 180 };
    case "EXTRA_RICH":
      return { articles: 10, images: 18, targetWords: 220 };
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

/**
 * Generate a single article body via Gemini, falling back to deterministic
 * text if Gemini is unavailable.
 */
async function generateArticleBody(
  title: string,
  brandVoice: string,
  careLevel: CareLevel,
  targetWords: number,
): Promise<string> {
  const voice = pickVoice(brandVoice);
  const flavor = careLevelFlavor(careLevel);

  const fallbackBody =
    FALLBACK_BODIES[title] ?? FALLBACK_BODIES_DEFAULT;

  const fallback: GeminiMockResponse = {
    article: {
      title,
      body: fallbackBody,
      wordCount: wordCount(fallbackBody),
    },
  };

  const systemPrompt = [
    "You are a copywriter for a senior-living community newsletter.",
    `Write a short, on-brand article body for the given title.`,
    `Tone should be: ${voice}.`,
    `Target approximately ${targetWords} words.`,
    `Always respond with valid JSON matching the schema. No prose outside JSON.`,
  ].join(" ");

  const userPrompt = JSON.stringify(
    {
      schema: {
        article: {
          title: "string (must match input title)",
          body: "the article body text",
          wordCount: "integer",
        },
      },
      title,
      targetWords,
    },
    null,
    2,
  );

  try {
    const result = await callGeminiJson<GeminiMockResponse>({
      schema: GeminiMockResponseSchema,
      systemPrompt,
      userPrompt,
      fallback,
    });

    let body = result.data.article.body;
    if (!body || body.trim().length < 20) {
      body = fallbackBody;
    }
    return body + flavor;
  } catch {
    return fallbackBody + flavor;
  }
}

export async function generateMockContent(
  input: GenerateMockContentInput,
): Promise<GenerateMockContentResult> {
  const { richness, careLevel, brandVoice } = input;
  const target = targetForRichness(richness);

  const articles: Article[] = [];
  const promises: Promise<void>[] = [];

  for (let i = 0; i < target.articles; i++) {
    const title = SEED_TITLES[i % SEED_TITLES.length];

    const p = generateArticleBody(title, brandVoice, careLevel, target.targetWords)
      .then(async (body) => {
        articles.push({
          id: createId(),
          title,
          body,
          wordCount: wordCount(body),
          byline: i === 0 ? "From the Executive Director" : undefined,
          isFiller: false,
          source: "MOCK",
        });
      });

    promises.push(p);
  }

  // Generate all article bodies in parallel
  await Promise.all(promises);

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
