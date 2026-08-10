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
  topicKey: string;
  url: string;
  sourceKey: string;
  caption: string;
  alt: string;
  description: string;
  aspect: StockAspect;
  tags: string[];
  articleTypes: string[];
  slotRoles: string[];
}

const CATALOG_VARIANTS_PER_TOPIC = 10;
const CAPTION_VARIANT_ENDINGS = [
  "",
  "for the month ahead",
  "during a favorite campus routine",
];
const REAL_LIFE_TAGS = new Set([
  "activity",
  "care",
  "celebration",
  "community",
  "connection",
  "conversation",
  "event",
  "family",
  "friends",
  "games",
  "happy hour",
  "helping",
  "music",
  "outing",
  "portrait",
  "resident",
  "social",
  "spotlight",
  "staff",
  "support",
  "team",
  "volunteer",
]);
const DETAIL_ONLY_TAGS = new Set([
  "campus",
  "decorations",
  "dining",
  "food",
  "holiday",
  "interior",
  "meal",
  "quiet",
  "reading",
  "technology",
]);

const PHOTO_TOPICS = [
  {
    key: "happy-hour",
    captions: [
      "Neighbors gathered for refreshments and conversation",
      "A relaxed happy hour table ready for friends",
      "Residents enjoying snacks, drinks, and easy conversation",
      "A bright social hour with familiar faces",
    ],
    alt: "Residents enjoying refreshments together",
    description: "A warm social gathering with drinks, snacks, and relaxed conversation, useful for happy hour and community social stories.",
    tags: ["happy hour", "social", "refreshments", "friends", "community", "celebration"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["happy-hour", "schedule", "photo-cluster", "collage"],
    aspects: ["landscape", "portrait", "square"] as StockAspect[],
  },
  {
    key: "outings",
    captions: [
      "Residents heading out for a community trip",
      "A group outing with plans for the day ahead",
      "Neighbors enjoying an off-campus adventure",
      "A sunny trip day with residents and team members",
    ],
    alt: "Group outing with residents and team members",
    description: "A senior living outing scene with residents preparing for or enjoying an off-campus activity, suited for trip calendars and out-and-about sections.",
    tags: ["outing", "trip", "travel", "community", "outside", "activity"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["out-and-about", "outings", "events", "caption"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "birthdays",
    captions: [
      "A birthday table ready for this month's celebrations",
      "Cake and cheerful details for milestone moments",
      "A festive setup for resident and team birthdays",
      "Simple celebration touches for a special day",
    ],
    alt: "Birthday cake and celebration table",
    description: "A festive birthday setup with cake, candles, and colorful decorations for resident and staff birthday panels.",
    tags: ["birthday", "celebration", "cake", "party", "milestone", "family"],
    articleTypes: ["birthday", "announcement"],
    slotRoles: ["birthdays", "panel:sun", "caption"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
  {
    key: "dining",
    captions: [
      "A seasonal meal prepared by the culinary team",
      "Fresh flavors arranged for a community table",
      "A welcoming plate from the kitchen",
      "Dining details that make the meal feel special",
    ],
    alt: "Fresh plated meal on a dining table",
    description: "A bright dining or culinary scene with fresh food, good table presentation, and a welcoming mealtime feel.",
    tags: ["dining", "food", "culinary", "brunch", "meal", "kitchen"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["feature-band", "caption", "hero"],
    aspects: ["landscape", "square"] as StockAspect[],
  },
  {
    key: "wellness",
    captions: [
      "Gentle wellness and movement activities",
      "A calm moment from the wellness calendar",
      "Light movement routines in a comfortable setting",
      "Healthy habits shaped around comfort and confidence",
    ],
    alt: "Senior wellness activity in a bright room",
    description: "A calm wellness image showing light movement, stretching, therapy, or healthy routines for older adults.",
    tags: ["wellness", "fitness", "movement", "health", "therapy", "exercise"],
    articleTypes: ["announcement", "other"],
    slotRoles: ["hero", "caption", "feature-band"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "garden",
    captions: [
      "Fresh color from the community garden",
      "Hands-on time with flowers and greenery",
      "A sunny garden moment on campus",
      "Seasonal blooms bringing color to the day",
    ],
    alt: "Hands tending plants in a sunny garden",
    description: "A garden or outdoor patio scene with flowers, greenery, and hands-on seasonal activity.",
    tags: ["garden", "flowers", "outdoor", "patio", "spring", "summer"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["caption", "collage", "photo-cluster"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
  {
    key: "music",
    captions: [
      "Live music bringing residents together",
      "A familiar song filling the room",
      "Entertainment that turned into an afternoon singalong",
      "A music program with plenty of requests",
    ],
    alt: "Musical performance for a community audience",
    description: "A lively music or entertainment scene appropriate for recaps about concerts, singalongs, patio music, and celebrations.",
    tags: ["music", "concert", "entertainment", "singalong", "performance", "event"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["events", "caption", "hero"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "resident-story",
    captions: [
      "A warm portrait moment for a resident story",
      "A comfortable spotlight photo with a personal feel",
      "A quiet smile suited for a featured profile",
      "A welcoming portrait for a story worth sharing",
    ],
    alt: "Older adult smiling in a comfortable setting",
    description: "A warm portrait-style image for resident spotlights, smile-of-the-month features, personal stories, and staff recognition.",
    tags: ["resident", "portrait", "smile", "story", "spotlight", "profile"],
    articleTypes: ["resident-story", "executive-note"],
    slotRoles: ["smile-of-the-month", "spotlight", "hero-portrait", "portrait"],
    aspects: ["portrait", "square"] as StockAspect[],
  },
  {
    key: "volunteer",
    captions: [
      "Helping hands making a difference on campus",
      "Everyday kindness shared between neighbors",
      "A volunteer moment built around connection",
      "Support and encouragement in the rhythm of the day",
    ],
    alt: "Volunteer and resident sharing a friendly moment",
    description: "A caring support image showing connection, helping hands, volunteering, and everyday kindness.",
    tags: ["volunteer", "helping", "kindness", "care", "support", "connection"],
    articleTypes: ["announcement", "other"],
    slotRoles: ["make-the-difference", "volunteer", "caption", "portrait"],
    aspects: ["portrait", "landscape"] as StockAspect[],
  },
  {
    key: "reading",
    captions: [
      "A peaceful afternoon with a good book",
      "Quiet reading time in a comfortable corner",
      "A slower moment for reflection and routine",
      "A calm editorial image for a lighter story",
    ],
    alt: "Person reading by a window",
    description: "A quiet lifestyle image for reflective stories, library groups, personal routines, and calmer editorial layouts.",
    tags: ["reading", "quiet", "library", "routine", "peaceful", "home"],
    articleTypes: ["resident-story", "other", "executive-note"],
    slotRoles: ["editorial", "hero", "caption"],
    aspects: ["portrait", "landscape"] as StockAspect[],
  },
  {
    key: "family",
    captions: [
      "Family and neighbors sharing time together",
      "A friendly visit in a familiar community space",
      "Connection across the table during a campus visit",
      "A warm welcome for families and guests",
    ],
    alt: "Family visit in a comfortable community space",
    description: "A family visit or neighbor connection scene for welcome notes, community stories, and family event invitations.",
    tags: ["family", "visit", "neighbors", "connection", "community", "welcome"],
    articleTypes: ["executive-note", "announcement", "resident-story"],
    slotRoles: ["exec-corner", "director", "caption", "hero"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "crafts",
    captions: [
      "Creative activities and hands-on projects",
      "Colorful supplies ready for an afternoon program",
      "A hands-on craft moment with plenty of personality",
      "Art table details from a community activity",
    ],
    alt: "Hands working on a colorful craft project",
    description: "A creative activity image with hands-on crafts, art supplies, and group participation for activity calendars and recaps.",
    tags: ["craft", "art", "activity", "creative", "hands", "program"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["events", "collage", "caption", "photo-cluster"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
  {
    key: "games",
    captions: [
      "Game table energy from an afternoon program",
      "A friendly round of cards and conversation",
      "Residents gathered around a favorite activity",
      "A playful moment from the life-enrichment calendar",
    ],
    alt: "Table game activity in a community room",
    description: "A social game or cards image for activity recaps, life-enrichment blurbs, and lighter photo collages.",
    tags: ["games", "cards", "activity", "social", "conversation", "life enrichment"],
    articleTypes: ["event-recap", "announcement"],
    slotRoles: ["events", "calendar", "photo-cluster", "collage", "happy-hour"],
    aspects: ["landscape", "square"] as StockAspect[],
  },
  {
    key: "holiday",
    captions: [
      "Seasonal decorations bringing color to the community",
      "A holiday setup ready for residents and families",
      "Festive details for a special campus gathering",
      "Celebration decor that marks the season",
    ],
    alt: "Seasonal holiday decorations in a community space",
    description: "A festive seasonal image for holiday panels, themed event recaps, brunch invitations, and colorful callouts.",
    tags: ["holiday", "seasonal", "celebration", "decorations", "family", "event"],
    articleTypes: ["announcement", "event-recap"],
    slotRoles: ["holiday", "events", "panel:navy", "panel:coral", "caption"],
    aspects: ["landscape", "square", "portrait"] as StockAspect[],
  },
  {
    key: "staff",
    captions: [
      "Team members helping the day run smoothly",
      "A staff spotlight moment with a welcoming feel",
      "Care team connection at the center of campus life",
      "A friendly team moment for recognition stories",
    ],
    alt: "Senior living staff member in a welcoming setting",
    description: "A staff recognition or team-service image for director notes, employee spotlights, and appreciation stories.",
    tags: ["staff", "team", "recognition", "service", "care", "spotlight"],
    articleTypes: ["announcement", "executive-note", "resident-story"],
    slotRoles: ["spotlight", "staff", "hero-portrait", "portrait", "exec-corner"],
    aspects: ["portrait", "landscape", "square"] as StockAspect[],
  },
  {
    key: "campus",
    captions: [
      "A welcoming corner of the community",
      "Campus spaces prepared for the day ahead",
      "A quiet setting that feels familiar and bright",
      "A comfortable community space between activities",
    ],
    alt: "Bright senior living community space",
    description: "A campus environment image for welcome notes, editorial layouts, calm filler slots, and brand-forward section breaks.",
    tags: ["campus", "community", "welcome", "home", "interior", "comfort"],
    articleTypes: ["executive-note", "other", "announcement"],
    slotRoles: ["editorial", "exec-corner", "quiet-space", "hero", "caption"],
    aspects: ["landscape", "portrait"] as StockAspect[],
  },
  {
    key: "technology",
    captions: [
      "A simple tech moment that keeps families connected",
      "Residents exploring digital connection at a comfortable pace",
      "Helpful technology woven into the everyday routine",
      "A connected moment for families near and far",
    ],
    alt: "Older adult using technology in a comfortable space",
    description: "A technology and connection image for family updates, digital programs, remote visits, and modern community services.",
    tags: ["technology", "connection", "family", "digital", "communication", "support"],
    articleTypes: ["announcement", "executive-note", "other"],
    slotRoles: ["feature-band", "editorial", "caption", "hero"],
    aspects: ["landscape", "portrait", "square"] as StockAspect[],
  },
];

const PEXELS_PHOTO_IDS = [
  7551668, 3768131, 3768136, 7551617, 7551667, 7551608, 7551752, 7551611,
  7551672, 7551681, 7551648, 3822622, 3822621, 3822623, 4148842, 4148843,
  3768114, 3768146, 3768138, 6646918, 6646917, 6646919, 6646878, 5799470,
  7088524, 7088530, 5637731, 5637733, 5637735, 6647037, 6647040,
];

function photoUrl(topic: string, aspect: StockAspect, index: number): string {
  void topic;
  const id = PEXELS_PHOTO_IDS[index % PEXELS_PHOTO_IDS.length];
  const width = aspect === "portrait" ? 1200 : aspect === "square" ? 1400 : 1600;
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

function sourceKey(url: string): string {
  return url.replace(/\?.*$/, "");
}

function variantCaption(captions: string[], variant: number): string {
  const base = captions[variant % captions.length];
  const ending = CAPTION_VARIANT_ENDINGS[Math.floor(variant / captions.length)] ?? "";
  return ending ? `${base} ${ending}` : base;
}

const STOCK_PHOTOS: StockPhoto[] = PHOTO_TOPICS.flatMap((topic, topicIndex) =>
  Array.from({ length: CATALOG_VARIANTS_PER_TOPIC }, (_, variant) => {
    const aspect = topic.aspects[variant % topic.aspects.length];
    const caption = variantCaption(topic.captions, variant);
    const url = photoUrl(topic.key, aspect, topicIndex * 10 + variant);
    return {
      id: `stock-${topic.key}-${variant + 1}`,
      topicKey: topic.key,
      url,
      sourceKey: sourceKey(url),
      caption,
      alt: topic.alt,
      description: `${topic.description} Variant ${variant + 1} is best for ${aspect} slots and ${caption.toLowerCase()}.`,
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
    if (role.includes("photo-stack") || /p2-photo-[ab]/.test(role)) return /out and about|outing|trip/.test(title);
    if (role.includes("upcoming") || role.includes("event")) return /event|calendar|activities/.test(title);
    if (role.includes("outing")) return /outing|out and about|trip/.test(title);
    if (role.includes("smile") || role.includes("spotlight")) return article.articleType === "resident-story";
    if (role.includes("volunteer")) return /volunteer|difference/.test(title);
    if (role.includes("feature-band") || role.includes("scrubbly")) return /scrubbly|car wash|feature/.test(title);
    if (role.includes("exec") || role.includes("director")) return article.articleType === "executive-note";
    return false;
  });
  if (exact) return exact;
  if (role.includes("photo-stack") || /p2-photo-[ab]/.test(role)) {
    const outing = articles.find((a) => /out and about|outing|trip/i.test(a.title));
    if (outing) return outing;
  }
  return articles.find((a) => a.articleType === "event-recap") ?? articles[0];
}

function scorePhoto(
  photo: StockPhoto,
  article: Article | undefined,
  slot: TemplateSlot,
  newsletterContext: Set<string>,
): number {
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
    if (newsletterContext.has(tag) || newsletterContext.has(tag.replace(/-/g, " "))) score += 1;
  }
  const slotHay = roleTokens(slot);
  const slotRole = `${slot.id} ${slot.styleTag ?? ""}`.toLowerCase();
  if (/p2-photo-|out[- ]?and[- ]?about|outing|trip/.test(slotRole)) {
    score += photo.topicKey === "outings" ? 28 : -12;
  }
  if (/smile|spotlight|portrait/.test(slotRole)) {
    score += photo.topicKey === "resident-story" || photo.topicKey === "staff" ? 18 : -8;
  }
  if (/volunteer|make[- ]?the[- ]?difference/.test(slotRole)) {
    score += photo.topicKey === "volunteer" ? 18 : -6;
  }
  if (/feature-band|scrubbly|car[- ]?wash/.test(slotRole)) {
    score += photo.topicKey === "games" || photo.topicKey === "crafts" || photo.topicKey === "happy-hour" ? 10 : -6;
  }
  for (const tag of photo.tags) {
    const normalized = tag.replace(/\s+/g, "-");
    if (slotHay.has(tag) || slotHay.has(normalized)) score += 5;
  }
  for (const role of photo.slotRoles) {
    const rt = tokens(role);
    for (const token of rt) if (slotHay.has(token)) score += 4;
  }
  const realLifeHits = photo.tags.filter((tag) => REAL_LIFE_TAGS.has(tag)).length;
  score += Math.min(8, realLifeHits * 2);
  if (/hero|portrait|spotlight|photo-cluster|collage|caption/.test(slotRole)) {
    score += Math.min(6, realLifeHits * 2);
  }
  if (/hero|portrait|spotlight|photo-cluster|collage/.test(slotRole)) {
    const detailOnlyHits = photo.tags.filter((tag) => DETAIL_ONLY_TAGS.has(tag)).length;
    score -= Math.min(8, detailOnlyHits * 2);
  }
  if (/birthday|holiday|dining|garden|feature-band/.test(slotRole)) {
    score += 2;
  }
  return score;
}

function captionFor(photo: StockPhoto, article: Article | undefined, slot: TemplateSlot): string {
  const title = article?.title?.trim();
  const role = `${slot.id} ${slot.styleTag ?? ""}`.toLowerCase();
  if (photo.topicKey === "volunteer" || photo.topicKey === "staff") {
    return photo.caption;
  }
  if (title && /birthday|anniversar|milestone/.test(role)) {
    return `${title} celebrated with a little extra color`;
  }
  if (title && /outing|out-and-about|trip/.test(role)) {
    return `${title} moments from a day out together`;
  }
  if (title && /happy-hour|schedule/.test(role)) {
    return `${title} brought neighbors together`;
  }
  if (title && /smile|spotlight|portrait/.test(role)) {
    return `${title} with a warm community feel`;
  }
  return photo.caption;
}

function cropFor(photo: StockPhoto, slot: TemplateSlot): Pick<NewsImage, "focalX" | "focalY" | "zoom"> {
  const role = `${slot.id} ${slot.styleTag ?? ""}`.toLowerCase();
  const desired = slot.capacity?.aspect;
  let zoom = /collage|photo-cluster|photo-stack/.test(role) ? 1.06 : 1.03;
  if (desired && desired !== "any" && desired !== photo.aspect) zoom += 0.08;
  if (photo.aspect === "portrait" && desired === "landscape") zoom += 0.05;
  if (photo.aspect === "landscape" && desired === "portrait") zoom += 0.05;
  const focalY = /portrait|spotlight|staff|resident/.test(role) ? 42 : 48;
  return {
    focalX: 50,
    focalY,
    zoom: Math.min(1.22, Number(zoom.toFixed(2))),
  };
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
  const wrapperPhotoReserve = input.gridSpec.label.startsWith("v3-") ? 2 : 0;
  const targetCount = Math.max(imageSlots.length + wrapperPhotoReserve, input.images.length, 8);
  const needed = Math.max(0, targetCount - userImages.length);
  const used = new Set(userImages.map((img) => img.id));
  const usedSources = new Set(userImages.map((img) => sourceKey(img.url)));
  const usedTopicCounts = new Map<string, number>();
  const newsletterContext = tokens(
    [
      input.gridSpec.label,
      ...input.articles.flatMap((article) => [article.title, article.body]),
    ].join(" "),
  );
  const picked: NewsImage[] = [];

  for (let i = 0; i < needed; i++) {
    const slot = imageSlots[i % imageSlots.length];
    const article = articleForSlot(input.articles, slot);
    const candidates = STOCK_PHOTOS
      .filter((p) => !used.has(p.id) && !usedSources.has(p.sourceKey))
      .map((p) => ({
        photo: p,
        score:
          scorePhoto(p, article, slot, newsletterContext) -
          ((usedTopicCounts.get(p.topicKey) ?? 0) * 14),
      }))
      .sort((a, b) => b.score - a.score || a.photo.id.localeCompare(b.photo.id));
    const best = candidates[0];
    if (!best) break;
    used.add(best.photo.id);
    usedSources.add(best.photo.sourceKey);
    usedTopicCounts.set(
      best.photo.topicKey,
      (usedTopicCounts.get(best.photo.topicKey) ?? 0) + 1,
    );
    picked.push({
      id: best.photo.id || createId(),
      url: best.photo.url,
      caption: captionFor(best.photo, article, slot),
      alt: best.photo.alt,
      description: best.photo.description,
      tags: best.photo.tags,
      aspect: best.photo.aspect,
      ...cropFor(best.photo, slot),
      isPlaceholder: false,
      source: "STOCK",
    });
  }

  return [...userImages, ...picked];
}

export function stockCatalogSize(): number {
  return STOCK_PHOTOS.length;
}
