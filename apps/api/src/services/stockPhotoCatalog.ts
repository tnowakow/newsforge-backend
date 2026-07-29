import { createId } from "@paralleldrive/cuid2";
import type {
  Article,
  GridSpec,
  NewsImage,
  TemplateSlot,
} from "@newsforge/shared/schemas";

type StockAspect = "square" | "portrait" | "landscape";

interface StockPhoto {
  id: string;
  url: string;
  caption: string;
  alt: string;
  description: string;
  aspect: StockAspect;
  tags: string[];
  articleTypes: string[];
  slotRoles: string[];
}

const PHOTO_TOPICS = [
  {
    key: "happy-hour",
    caption: "Residents gathering for refreshments and conversation",
    alt: "Residents enjoying refreshments together",
    description: "A warm social gathering with drinks, snacks, and relaxed conversation, useful for happy hour and community social stories.",
    tags: ["happy hour", "social", "refreshments", "friends", "community", "celebration"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["happy-hour", "schedule", "photo-cluster", "collage"],
    aspects: ["landscape", "portrait", "square"] as StockAspect[],
  },
  {
    key: "outings",
    caption: "Residents heading out for a community trip",
    alt: "Group outing with residents and team members",
    description: "A senior living outing scene with residents preparing for or enjoying an off-campus activity, suited for trip calendars and out-and-about sections.",
    tags: ["outing", "trip", "travel", "community", "outside", "activity"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["out-and-about", "outings", "events", "caption"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "birthdays",
    caption: "A birthday celebration with cake and cheerful decorations",
    alt: "Birthday cake and celebration table",
    description: "A festive birthday setup with cake, candles, and colorful decorations for resident and staff birthday panels.",
    tags: ["birthday", "celebration", "cake", "party", "milestone", "family"],
    articleTypes: ["birthday", "announcement"],
    slotRoles: ["birthdays", "panel:sun", "caption"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
  {
    key: "dining",
    caption: "A seasonal meal prepared by the culinary team",
    alt: "Fresh plated meal on a dining table",
    description: "A bright dining or culinary scene with fresh food, good table presentation, and a welcoming mealtime feel.",
    tags: ["dining", "food", "culinary", "brunch", "meal", "kitchen"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["feature-band", "caption", "hero"],
    aspects: ["landscape", "square"] as StockAspect[],
  },
  {
    key: "wellness",
    caption: "Gentle wellness and movement activities",
    alt: "Senior wellness activity in a bright room",
    description: "A calm wellness image showing light movement, stretching, therapy, or healthy routines for older adults.",
    tags: ["wellness", "fitness", "movement", "health", "therapy", "exercise"],
    articleTypes: ["announcement", "other"],
    slotRoles: ["hero", "caption", "feature-band"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "garden",
    caption: "Residents enjoying flowers and garden color",
    alt: "Hands tending plants in a sunny garden",
    description: "A garden or outdoor patio scene with flowers, greenery, and hands-on seasonal activity.",
    tags: ["garden", "flowers", "outdoor", "patio", "spring", "summer"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["caption", "collage", "photo-cluster"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
  {
    key: "music",
    caption: "Live music bringing residents together",
    alt: "Musical performance for a community audience",
    description: "A lively music or entertainment scene appropriate for recaps about concerts, singalongs, patio music, and celebrations.",
    tags: ["music", "concert", "entertainment", "singalong", "performance", "event"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["events", "caption", "hero"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "resident-story",
    caption: "A quiet portrait moment with a resident",
    alt: "Older adult smiling in a comfortable setting",
    description: "A warm portrait-style image for resident spotlights, smile-of-the-month features, personal stories, and staff recognition.",
    tags: ["resident", "portrait", "smile", "story", "spotlight", "profile"],
    articleTypes: ["resident-story", "executive-note"],
    slotRoles: ["smile-of-the-month", "spotlight", "hero-portrait", "portrait"],
    aspects: ["portrait", "square"] as StockAspect[],
  },
  {
    key: "volunteer",
    caption: "Helping hands making a difference on campus",
    alt: "Volunteer and resident sharing a friendly moment",
    description: "A caring support image showing connection, helping hands, volunteering, and everyday kindness.",
    tags: ["volunteer", "helping", "kindness", "care", "support", "connection"],
    articleTypes: ["announcement", "other"],
    slotRoles: ["make-the-difference", "volunteer", "caption", "portrait"],
    aspects: ["portrait", "landscape"] as StockAspect[],
  },
  {
    key: "reading",
    caption: "A peaceful afternoon with a good book",
    alt: "Person reading by a window",
    description: "A quiet lifestyle image for reflective stories, library groups, personal routines, and calmer editorial layouts.",
    tags: ["reading", "quiet", "library", "routine", "peaceful", "home"],
    articleTypes: ["resident-story", "other", "executive-note"],
    slotRoles: ["editorial", "hero", "caption"],
    aspects: ["portrait", "landscape"] as StockAspect[],
  },
  {
    key: "family",
    caption: "Family and neighbors sharing time together",
    alt: "Family visit in a comfortable community space",
    description: "A family visit or neighbor connection scene for welcome notes, community stories, and family event invitations.",
    tags: ["family", "visit", "neighbors", "connection", "community", "welcome"],
    articleTypes: ["executive-note", "announcement", "resident-story"],
    slotRoles: ["exec-corner", "director", "caption", "hero"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "crafts",
    caption: "Creative activities and hands-on projects",
    alt: "Hands working on a colorful craft project",
    description: "A creative activity image with hands-on crafts, art supplies, and group participation for activity calendars and recaps.",
    tags: ["craft", "art", "activity", "creative", "hands", "program"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["events", "collage", "caption", "photo-cluster"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
];

function photoUrl(topic: string, aspect: StockAspect, index: number): string {
  const size =
    aspect === "portrait" ? "1100x1600" : aspect === "square" ? "1400x1400" : "1600x1100";
  const terms = encodeURIComponent(`senior,living,${topic.replace(/-/g, ",")}`);
  return `https://loremflickr.com/${size}/${terms}/all?lock=${7300 + index}`;
}

const STOCK_PHOTOS: StockPhoto[] = PHOTO_TOPICS.flatMap((topic, topicIndex) =>
  Array.from({ length: 8 }, (_, variant) => {
    const aspect = topic.aspects[variant % topic.aspects.length];
    return {
      id: `stock-${topic.key}-${variant + 1}`,
      url: photoUrl(topic.key, aspect, topicIndex * 10 + variant),
      caption: topic.caption,
      alt: topic.alt,
      description: topic.description,
      aspect,
      tags: [...topic.tags, topic.key],
      articleTypes: topic.articleTypes,
      slotRoles: topic.slotRoles,
    };
  }),
);

function tokens(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function roleTokens(slot: TemplateSlot): Set<string> {
  return tokens(`${slot.id} ${slot.type} ${slot.styleTag ?? ""}`);
}

function articleForSlot(articles: Article[], slot: TemplateSlot): Article | undefined {
  const role = `${slot.id} ${slot.styleTag ?? ""}`.toLowerCase();
  const exact = articles.find((article) => {
    const title = article.title.toLowerCase();
    if (role.includes("birthday")) return article.articleType === "birthday" || title.includes("birthday");
    if (role.includes("happy-hour")) return title.includes("happy hour");
    if (role.includes("upcoming") || role.includes("event")) return /event|calendar|activities/.test(title);
    if (role.includes("outing")) return /outing|out and about|trip/.test(title);
    if (role.includes("smile") || role.includes("spotlight")) return article.articleType === "resident-story";
    if (role.includes("volunteer")) return /volunteer|difference/.test(title);
    if (role.includes("feature-band") || role.includes("scrubbly")) return /scrubbly|car wash|feature/.test(title);
    if (role.includes("exec") || role.includes("director")) return article.articleType === "executive-note";
    return false;
  });
  if (exact) return exact;
  return articles.find((a) => a.articleType === "event-recap") ?? articles[0];
}

function scorePhoto(photo: StockPhoto, article: Article | undefined, slot: TemplateSlot): number {
  let score = 0;
  if (slot.capacity?.aspect && slot.capacity.aspect !== "any" && slot.capacity.aspect === photo.aspect) {
    score += 8;
  } else if (!slot.capacity?.aspect) {
    score += 2;
  }
  if (article?.articleType && photo.articleTypes.includes(article.articleType)) score += 5;

  const hay = tokens(`${article?.title ?? ""} ${article?.body ?? ""}`);
  for (const tag of photo.tags) {
    if (hay.has(tag) || hay.has(tag.replace(/-/g, " "))) score += 3;
  }
  const slotHay = roleTokens(slot);
  for (const role of photo.slotRoles) {
    const rt = tokens(role);
    for (const token of rt) if (slotHay.has(token)) score += 4;
  }
  return score;
}

interface SelectStockPhotosInput {
  articles: Article[];
  images: NewsImage[];
  gridSpec: GridSpec;
}

function shouldReplaceGeneratedPhoto(img: NewsImage): boolean {
  return img.source === "MOCK" || img.source === "GENERATED" || img.source === "STOCK";
}

export function selectStockPhotosForRun(input: SelectStockPhotosInput): NewsImage[] {
  const imageSlots = input.gridSpec.slots
    .filter((s) => s.type === "image")
    .sort((a, b) => (a.page - b.page) || (a.row - b.row) || (a.col - b.col));
  if (imageSlots.length === 0) return input.images;

  const userImages = input.images.filter((img) => !shouldReplaceGeneratedPhoto(img));
  const targetCount = Math.max(imageSlots.length, input.images.length, 8);
  const needed = Math.max(0, targetCount - userImages.length);
  const used = new Set(userImages.map((img) => img.id));
  const picked: NewsImage[] = [];

  for (let i = 0; i < needed; i++) {
    const slot = imageSlots[i % imageSlots.length];
    const article = articleForSlot(input.articles, slot);
    const candidates = STOCK_PHOTOS
      .filter((p) => !used.has(p.id))
      .map((p) => ({ photo: p, score: scorePhoto(p, article, slot) }))
      .sort((a, b) => b.score - a.score || a.photo.id.localeCompare(b.photo.id));
    const best = candidates[0];
    if (!best) break;
    used.add(best.photo.id);
    picked.push({
      id: best.photo.id || createId(),
      url: best.photo.url,
      caption: best.photo.caption,
      alt: best.photo.alt,
      description: best.photo.description,
      tags: best.photo.tags,
      aspect: best.photo.aspect,
      focalX: 50,
      focalY: 50,
      zoom: 1,
      isPlaceholder: false,
      source: "STOCK",
    });
  }

  return [...userImages, ...picked];
}

export function stockCatalogSize(): number {
  return STOCK_PHOTOS.length;
}
