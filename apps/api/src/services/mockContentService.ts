import crypto from "node:crypto";
import { prisma } from "../db.js";
import { makeRng, pick, range } from "./rng.js";
import type { Article } from "@newsforge/shared";
import type { ImageRef } from "@newsforge/shared";

/**
 * Deterministic mock content generator — keyed by (clientId, monthLabel).
 * Vitaly §6.4: same seed must yield same output across the whole demo.
 */

const FIRST_NAMES = [
  "Mae", "Harold", "Ruth", "Walter", "Eleanor", "Frank", "Dorothy", "George",
  "Mildred", "Arthur", "Beatrice", "Clarence", "Vera", "Stanley", "Lillian",
  "Ernest", "Pearl", "Russell", "Hazel", "Floyd",
];

const LAST_INITIALS = ["T.", "K.", "M.", "B.", "G.", "P.", "R.", "S.", "L.", "W."];

const HOBBIES = [
  "watercolor painting", "vegetable gardening", "ballroom dancing", "bird-watching",
  "chair yoga", "memoir writing", "porch quilting", "amateur radio",
  "fly-tying", "pickleball", "harmonica", "competitive sudoku",
];

const EVENT_TYPES = [
  { name: "Garden tea", category: "social" },
  { name: "Chair yoga", category: "wellness" },
  { name: "Memoir circle", category: "creative" },
  { name: "Trivia night", category: "social" },
  { name: "Resident art show", category: "creative" },
  { name: "Bus outing to the farmers' market", category: "social" },
  { name: "Live music — local quartet", category: "entertainment" },
  { name: "Walking club", category: "wellness" },
  { name: "Movie matinee", category: "entertainment" },
  { name: "Birthday luncheon", category: "social" },
  { name: "Bingo night", category: "social" },
  { name: "Brain games hour", category: "wellness" },
];

const MENU_HIGHLIGHTS = [
  "Sunday roast with rosemary potatoes",
  "Garden minestrone with fresh basil",
  "Lemon-herb baked chicken",
  "Strawberry shortcake",
  "Wild-mushroom risotto",
  "Carolina pulled pork on brioche",
  "Maple-glazed salmon",
  "Apple-cinnamon bread pudding",
  "Buttermilk biscuits with sausage gravy",
  "Heirloom-tomato gazpacho",
];

function sentence(words: string[]): string {
  const s = words.join(" ");
  return s[0]!.toUpperCase() + s.slice(1) + ".";
}

function makeDirectorsLetter(
  rng: () => number,
  clientName: string,
  monthLabel: string,
  tone: string,
  brandVoice: string,
): Article {
  const openers = [
    `Dear ${clientName} friends and families,`,
    `Friends of ${clientName},`,
    `Dear neighbors,`,
  ];
  const month = monthLabel.split(" ")[0] ?? "this month";
  const themes = [
    "the long days of summer have settled gently over our porches",
    "the breeze has begun to carry the first hints of the season's change",
    "our gardens are spilling over with color and conversation",
    "the season has arrived with its quiet, generous light",
  ];
  const middles = [
    `Our team has been busy planning a calendar that honors what makes ${clientName} feel like home: small gatherings, shared meals, and the kind of unhurried company that good neighbors give one another.`,
    `What I keep hearing — from residents, from families, from staff — is gratitude for the small things: a familiar face in the hallway, the smell of coffee at six, the way a song from sixty years ago can stop a whole room.`,
    `This month brings a few new faces to our staff and a few returning favorites to the activity calendar. We are, as always, listening — and adjusting where we can.`,
  ];
  const closers = [
    "With warmth and gratitude,",
    "With every good wish,",
    "Yours in community,",
  ];
  const opener = pick(rng, openers);
  const middle1 = pick(rng, middles);
  const middle2 = pick(rng, middles);
  const closer = pick(rng, closers);
  const body =
    `${opener}\n\n` +
    `As ${month} arrives, ${pick(rng, themes)}, and we find ourselves grateful — again — for the community you make possible. ${brandVoice}\n\n` +
    `${middle1}\n\n${middle2}\n\n` +
    `Please stop by the front office if you have a story to share, a suggestion to make, or simply a cup of coffee to claim. Our door is open.\n\n` +
    `${closer}\nThe ${clientName} Team`;
  return {
    id: idFrom("dir", clientName, monthLabel),
    title: "From the Director's Desk",
    body,
    wordCount: countWords(body),
    tone,
    section: "Director's Letter",
  };
}

function makeResidentSpotlight(
  rng: () => number,
  clientName: string,
  monthLabel: string,
  tone: string,
): Article {
  const first = pick(rng, FIRST_NAMES);
  const last = pick(rng, LAST_INITIALS);
  const hobby = pick(rng, HOBBIES);
  const decades = pick(rng, ["1940s", "1950s", "1960s", "1970s"]);
  const places = ["Charleston", "Toledo", "Tulsa", "Burlington", "Pasadena", "Spokane", "Mobile"];
  const home = pick(rng, places);
  const body =
    `${first} ${last} arrived at ${clientName} two summers ago, ${pick(rng, ["with a small suitcase and a very large hat", "with a houseplant she refused to leave behind", "with a record collection that quietly took over the common room"])}. She grew up in ${home} in the ${decades}, where ${pick(rng, ["the church potlucks ran past nightfall", "the streetcar bell was the soundtrack of childhood", "her mother taught the whole neighborhood to bake bread"])}.\n\n` +
    `These days you'll most often find her at ${hobby} — usually on the patio, occasionally with company, always with strong opinions. "I never thought I'd take it up so seriously," she says. "But there's something about ${pick(rng, ["the practice of it", "the quiet of it", "the patience it asks of you"])}."\n\n` +
    `Ask her what she loves most about ${clientName} and she'll answer without hesitating: "The people. Always the people."`;
  return {
    id: idFrom("spotlight", clientName, monthLabel),
    title: `Resident Spotlight: ${first} ${last}`,
    body,
    wordCount: countWords(body),
    tone,
    section: "Resident Spotlight",
  };
}

function makeEventsArticle(
  rng: () => number,
  clientName: string,
  monthLabel: string,
  tone: string,
): Article {
  const count = range(rng, 5, 8);
  const seen = new Set<string>();
  const lines: string[] = [];
  while (lines.length < count) {
    const ev = pick(rng, EVENT_TYPES);
    if (seen.has(ev.name)) continue;
    seen.add(ev.name);
    const day = range(rng, 1, 28);
    const hour = pick(rng, ["10:00 a.m.", "2:00 p.m.", "3:30 p.m.", "6:00 p.m."]);
    lines.push(`• ${monthLabel.split(" ")[0]} ${day} — ${ev.name}, ${hour}, ${pick(rng, ["Garden Room", "Library", "Activity Hall", "Front Porch", "Dining Room"])}.`);
  }
  const intro = `A look at what's coming up at ${clientName} this month. Sign-ups are at the front desk; please let us know about any accommodations you'd like.`;
  const body = `${intro}\n\n${lines.join("\n")}`;
  return {
    id: idFrom("events", clientName, monthLabel),
    title: `This Month at ${clientName}`,
    body,
    wordCount: countWords(body),
    tone,
    section: "Events",
  };
}

function makeMenuArticle(
  rng: () => number,
  clientName: string,
  monthLabel: string,
  tone: string,
): Article {
  const picks: string[] = [];
  const used = new Set<number>();
  while (picks.length < 5) {
    const i = Math.floor(rng() * MENU_HIGHLIGHTS.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push(`• ${MENU_HIGHLIGHTS[i]}`);
  }
  const body =
    `Chef ${pick(rng, ["Lillian", "Marcus", "Beverly", "Dean"])} is leaning into ${pick(rng, ["seasonal greens", "stone fruit", "slow-cooked classics", "summer berries"])} this month. A few highlights from the kitchen:\n\n${picks.join("\n")}\n\nDietary accommodations: please flag them at the dining room desk by Sunday for the week ahead.`;
  return {
    id: idFrom("menu", clientName, monthLabel),
    title: "From the Kitchen",
    body,
    wordCount: countWords(body),
    tone,
    section: "Menu",
  };
}

function makeBirthdaysArticle(
  rng: () => number,
  clientName: string,
  monthLabel: string,
  tone: string,
): Article {
  const count = range(rng, 4, 8);
  const seen = new Set<string>();
  const names: string[] = [];
  while (names.length < count) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_INITIALS);
    const key = `${first} ${last}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(`• ${first} ${last} — ${pick(rng, ["the 3rd", "the 7th", "the 11th", "the 14th", "the 19th", "the 22nd", "the 26th"])}`);
  }
  const body = `A round of warm wishes to our ${monthLabel.split(" ")[0]} birthday celebrants. We'll gather for the monthly luncheon on the last Wednesday — guests welcome.\n\n${names.join("\n")}`;
  return {
    id: idFrom("birthdays", clientName, monthLabel),
    title: `${monthLabel.split(" ")[0]} Birthdays`,
    body,
    wordCount: countWords(body),
    tone,
    section: "Birthdays",
  };
}

function makeImages(rng: () => number, clientName: string, monthLabel: string): ImageRef[] {
  // Vitaly: NO real resident photos. Use deterministic abstract / pattern images (data URIs).
  const palettes = [
    ["#1F4D8C", "#E8DCB9"],
    ["#7A3C39", "#F1E0D6"],
    ["#2C5F4A", "#E2EAD0"],
    ["#5D3A8B", "#EFE4F7"],
    ["#B4541A", "#F8E6CF"],
  ];
  const count = range(rng, 4, 7);
  const out: ImageRef[] = [];
  for (let i = 0; i < count; i++) {
    const pal = pick(rng, palettes);
    const svg = makePatternSvg(pal[0]!, pal[1]!, rng, `${clientName}-${monthLabel}-${i}`);
    out.push({
      id: idFrom(`img${i}`, clientName, monthLabel),
      url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      width: 1200,
      height: 800,
      alt: `Mock illustration ${i + 1} — ${pick(rng, ["garden party", "common room", "outdoor patio", "library nook", "art studio"])} (no real photo)`,
      source: "mock",
    });
  }
  return out;
}

function makePatternSvg(c1: string, c2: string, rng: () => number, _key: string): string {
  // Simple abstract pattern — repeatable from RNG; no people, no real places.
  const blobs: string[] = [];
  for (let i = 0; i < 14; i++) {
    const cx = Math.floor(rng() * 1200);
    const cy = Math.floor(rng() * 800);
    const r = Math.floor(rng() * 180) + 40;
    const f = i % 2 === 0 ? c1 : c2;
    const o = (0.15 + rng() * 0.35).toFixed(2);
    blobs.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" opacity="${o}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${c2}"/>${blobs.join("")}<rect width="1200" height="800" fill="${c1}" opacity="0.08"/></svg>`;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).length;
}

function idFrom(...parts: string[]): string {
  const h = crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
  return `${parts[0]}_${h}`;
}

export interface MockContentResult {
  articles: Article[];
  images: ImageRef[];
}

export async function generateMockContent(
  clientId: string,
  monthLabel: string,
  opts?: { tone?: string; density?: number; includeSections?: string[] },
): Promise<MockContentResult> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error(`Client not found: ${clientId}`);

  const tone = opts?.tone ?? "warm";
  const density = opts?.density ?? richnessToDensity(client.richnessLevel);

  const rng = makeRng(`${clientId}::${monthLabel}::v1`);

  const articles: Article[] = [];
  articles.push(makeDirectorsLetter(rng, client.name, monthLabel, tone, client.brandVoice));
  articles.push(makeResidentSpotlight(rng, client.name, monthLabel, tone));
  articles.push(makeEventsArticle(rng, client.name, monthLabel, tone));
  articles.push(makeMenuArticle(rng, client.name, monthLabel, tone));

  if (density >= 3) {
    articles.push(makeBirthdaysArticle(rng, client.name, monthLabel, tone));
  }
  if (density >= 4) {
    // Extra: a second resident spotlight for very rich clients.
    articles.push({
      ...makeResidentSpotlight(rng, client.name, monthLabel, tone),
      id: idFrom("spotlight2", client.name, monthLabel),
      title: `Resident Spotlight: ${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_INITIALS)}`,
    });
  }

  const images = makeImages(rng, client.name, monthLabel);
  return { articles, images };
}

function richnessToDensity(r: string): number {
  switch (r) {
    case "SIMPLE":
      return 1;
    case "MODERATE":
      return 2;
    case "RICH":
      return 3;
    case "EXTRA_RICH":
      return 4;
    default:
      return 2;
  }
}
