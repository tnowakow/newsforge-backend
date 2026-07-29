/**
 * Deterministic sample-content generator used by the demo workspace.
 * The output is intentionally editorial rather than lorem ipsum: every
 * article has a distinct purpose, concrete detail, and layout-friendly length.
 */
import { createId } from "@paralleldrive/cuid2";
import type {
  Article,
  CareLevel,
  NewsImage,
  RecurringSection,
  Richness,
} from "@newsforge/shared/schemas";

export type MockTone = "warm" | "formal" | "playful" | "civic";
export type MockScenario =
  | "community-classic"
  | "panel-garden"
  | "photo-festival"
  | "resident-feature"
  | "editorial-light";

interface StorySeed {
  key: string;
  title: (input: GenerateMockContentInput) => string;
  body: (input: GenerateMockContentInput) => string;
  articleType: Article["articleType"];
  sectionMatch?: RegExp;
}

const STORY_SEEDS: StorySeed[] = [
  {
    key: "director",
    title: ({ monthLabel }) => `${monthLabel ?? "This Month"}, One Moment at a Time`,
    articleType: "executive-note",
    sectionMatch: /director|executive|welcome/i,
    body: (input) =>
      paragraphs(input, [
        `This month at ${input.clientName ?? "our community"}, the moments worth remembering have been wonderfully ordinary: coffee lingering a little longer after breakfast, a familiar song carrying down the hall, and neighbors saving one another a seat on the patio.`,
        `Those small rituals are how a building becomes a community. Our team is making room for more of them in ${input.monthLabel ?? "the weeks ahead"}, with relaxed gatherings, family visits, and activities shaped by what residents tell us they enjoy most.`,
        `Thank you to the residents, families, volunteers, and team members who bring warmth to each day. We are grateful you are part of this chapter with us.`,
      ]),
  },
  {
    key: "spotlight",
    title: () => "The Table Where Stories Gather",
    articleType: "resident-story",
    sectionMatch: /resident|spotlight|feature/i,
    body: (input) =>
      paragraphs(input, [
        `Every Thursday afternoon, a small group gathers around the long table with photo albums, recipe cards, and questions that rarely have one-word answers. A conversation about first jobs becomes a story about a neighborhood grocery; a favorite song opens the door to a wedding-day memory.`,
        `The point is not to rush toward a finished project. It is to notice what makes each story personal: the smell of bread cooling on a windowsill, the make of a first car, or the friend who always knew how to make everyone laugh.`,
        `Families are invited to add a copy of a favorite photo or recipe to the table. Together, those details create a living portrait of the people who make ${input.clientName ?? "this community"} feel like home.`,
      ]),
  },
  {
    key: "events",
    title: () => "Patio Music, Lemonade, and an Encore",
    articleType: "event-recap",
    body: (input) =>
      paragraphs(input, [
        `The first notes drew people outside before the lemonade was poured. By the second song, the patio had become a front-row seat, with residents calling out requests and keeping time from the shade.`,
        `The biggest response came from a familiar favorite. Staff paused in the doorway, visiting family members joined the chorus, and the musicians stayed for one more song after the planned set had ended.`,
        `It was a simple afternoon with all the right ingredients: good weather, good company, and music everyone could carry home. Photos from the gathering will be shared on the community board this week.`,
      ]),
  },
  {
    key: "menu",
    title: () => "From the Kitchen: A Taste of Home",
    articleType: "announcement",
    body: (input) =>
      paragraphs(input, [
        `This month's kitchen feature begins with a resident suggestion: a Sunday-style supper served family-style, with roast chicken, herb potatoes, green beans, and warm rolls passed around the table.`,
        `The culinary team is also bringing back a build-your-own sundae afternoon. Residents can choose the classics or add a little crunch, fruit, or extra chocolate.`,
        `Menu ideas are always welcome. Share a favorite dish or food memory with the dining team, and it may inspire a future tasting table.`,
      ]),
  },
  {
    key: "opEd",
    title: () => "Why Familiar Rhythms Matter",
    articleType: "other",
    body: (input) =>
      paragraphs(input, [
        `A full calendar can be exciting, but a meaningful day is not measured by the number of activities on it. Often, the best experiences begin with familiarity: the same chair by the window, a favorite mug, or a walk taken at an unhurried pace.`,
        `At ${input.clientName ?? "our community"}, choice comes first. Residents can join the crowd, spend time with a close friend, or enjoy a quieter routine that feels like their own.`,
        `That balance gives every day its shape. It leaves room for celebration without losing the comfort of the rituals people know and value.`,
      ]),
  },
  {
    key: "calendar",
    title: ({ monthLabel }) => `${monthLabel ?? "This Month"} at a Glance`,
    articleType: "announcement",
    sectionMatch: /calendar|activities|events/i,
    body: (input) =>
      paragraphs(input, [
        `The month ahead includes a courtyard social, a live-music afternoon, a hands-on cooking demonstration, and a family game night. Smaller neighborhood gatherings will continue throughout the week.`,
        `${careInvitation(input.careLevel)} Final dates and times belong on the posted activity calendar so families can plan visits around the events their loved ones enjoy most.`,
      ]),
  },
  {
    key: "wellness",
    title: () => "A Gentler Way to Keep Moving",
    articleType: "announcement",
    body: (input) =>
      paragraphs(input, [
        `Movement does not have to be strenuous to make the day feel brighter. This month, wellness sessions will pair familiar music with seated stretches, balance practice, and short walks at a comfortable pace.`,
        `Residents can participate for a full session or simply stop in for a favorite song. The emphasis is on comfort, confidence, and enjoying time together.`,
        `${careInvitation(input.careLevel)} Families can ask the life-enrichment team which sessions may be the best fit.`,
      ]),
  },
  {
    key: "welcome",
    title: () => "New Faces, Warm Welcomes",
    articleType: "announcement",
    body: (input) =>
      paragraphs(input, [
        `A welcoming community is built one introduction at a time. This month, residents and team members are making extra room at coffee groups, dining tables, and afternoon programs for neighbors who are still learning the rhythms of a new home.`,
        `A hello in the hallway or an invitation to sit together can make the unfamiliar feel easier. Families can help by sharing favorite hobbies, music, and routines with the team.`,
      ]),
  },
  {
    key: "birthdays",
    title: () => "Reasons to Celebrate",
    articleType: "birthday",
    sectionMatch: /birthday|anniversar|milestone/i,
    body: (input) =>
      paragraphs(input, [
        `Birthday breakfasts, anniversary flowers, and a few well-timed surprises are on the calendar this month. The full celebration list will be confirmed with residents and families before publication.`,
        `Watch the community board for gathering details, and bring your singing voice. Every milestone deserves a moment that feels personal.`,
      ]),
  },
];

const IMAGE_SEEDS = [
  {
    url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
    caption: "A welcoming table ready for neighbors and families",
    alt: "Bright community dining space",
    aspect: "landscape" as const,
  },
  {
    url: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac",
    caption: "Friends enjoying time outdoors together",
    alt: "Friends gathered outside",
    aspect: "landscape" as const,
  },
  {
    url: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b",
    caption: "Fresh color in the community garden",
    alt: "Hands tending a garden",
    aspect: "landscape" as const,
  },
  {
    url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352",
    caption: "A seasonal spread from the culinary team",
    alt: "Colorful food arranged on a table",
    aspect: "square" as const,
  },
  {
    url: "https://images.unsplash.com/photo-1544717305-2782549b5136",
    caption: "A quiet afternoon with a good book",
    alt: "Person reading near a window",
    aspect: "portrait" as const,
  },
];

export interface GenerateMockContentInput {
  richness: Richness;
  careLevel: CareLevel;
  brandVoice: string;
  clientName?: string;
  city?: string;
  monthLabel?: string;
  tone?: MockTone;
  density?: number;
  include?: string[];
  scenario?: MockScenario;
  recurringSections?: RecurringSection[];
}

export interface GenerateMockContentResult {
  articles: Article[];
  images: NewsImage[];
}

export function generateMockContent(
  input: GenerateMockContentInput,
): GenerateMockContentResult {
  const density = normalizeDensity(input.density, input.richness);
  const targets = [
    { articles: 5, images: 4 },
    { articles: 8, images: 6 },
    { articles: 12, images: 8 },
    { articles: 16, images: 12 },
  ][density - 1];

  if ((input.clientName ?? "").toLowerCase().includes("trilogy")) {
    return generateTrilogyMockContent(input, targets);
  }
  const requested = new Set(
    input.include ?? ["director", "spotlight", "events", "menu"],
  );
  const selected = [
    ...STORY_SEEDS.filter((story) => requested.has(story.key)),
    ...STORY_SEEDS.filter((story) => !requested.has(story.key)),
  ].slice(0, targets.articles);

  const articles = selected.map((story) => {
    const body = story.body(input);
    const section = input.recurringSections?.find((candidate) =>
      story.sectionMatch?.test(candidate.title),
    );
    return {
      id: createId(),
      title: section?.title ?? story.title(input),
      body,
      wordCount: wordCount(body),
      byline: story.key === "director" ? "From the Executive Director" : undefined,
      sectionId: section?.id,
      isFiller: false,
      source: "MOCK" as const,
      articleType: story.articleType,
    };
  });

  const images = Array.from({ length: targets.images }, (_, index) => {
    const seed = IMAGE_SEEDS[index % IMAGE_SEEDS.length];
    return {
      id: createId(),
      url: `${seed.url}?auto=format&fit=crop&w=1400&q=82&sig=${index}`,
      caption: seed.caption,
      alt: seed.alt,
      aspect: seed.aspect,
      isPlaceholder: false,
      source: "MOCK" as const,
    };
  });

  return { articles, images };
}

function generateTrilogyMockContent(
  input: GenerateMockContentInput,
  targets: { articles: number; images: number },
): GenerateMockContentResult {
  const monthName = (input.monthLabel ?? "July").split(/\s+/)[0] || "July";
  const seeds: StorySeed[] = [
    {
      key: "birthdays",
      title: () => "Happy Birthday!",
      articleType: "birthday",
      sectionMatch: /birthday|anniversar|milestone/i,
      body: () =>
        "RESIDENTS\nMary Ann F. 7/3\nShirley S. 7/10\nJanice F. 7/22\nMichael V. 7/27\nJoan C. 7/31\n\nSTAFF\nErica M. 7/1\nShristy P. 7/3\nJed N. 7/3\nAdam J. 7/4\nGracey C. 7/8\nDeborah R. 7/11\nMorgan C. 7/20\nKimberly H. 7/21\nDivya K. 7/24\nAlena O. 7/25\nAsenath A. 7/28",
    },
    {
      key: "holiday",
      title: () => "Happy 4th of July",
      articleType: "announcement",
      body: () =>
        "Celebrating red, white, and blue with music, cookout favorites, porch visits, and a campus full of summer color.",
    },
    {
      key: "director",
      title: () => "Executive Director Corner",
      articleType: "executive-note",
      sectionMatch: /director|executive|welcome/i,
      body: () =>
        paragraphs(input, [
          `Happy ${monthName}, everyone! It has been an amazing summer so far of cookouts, evenings with friends, and refreshing happy hours to help us cool down.`,
          `Around this time of year, many of us remember looking toward the return to school, but here on campus the middle of summer means the fun is just getting started. Live entertainment, themed events, and afternoons outside have brought residents, families, and team members together in the best way.`,
          `Thank you for continuing to join us for the laughter, visits, and small daily rhythms that make this community feel like home. Have a wonderful month.`,
          `Yours in service,\nThe Executive Director`,
        ]),
    },
    {
      key: "scrubbly",
      title: () => "Scrubbly Bubbly Car Wash",
      articleType: "event-recap",
      sectionMatch: /feature|spotlight/i,
      body: () =>
        paragraphs(input, [
          `Residents recently rolled into our Scrubbly Bubbly Car Wash, a special event dedicated to giving wheelchairs, walkers, and mobility devices a fresh shine.`,
          `While waiting for their vehicle to receive the VIP treatment, residents gathered for an ice cream social, shared stories, and spent time visiting with one another throughout the afternoon.`,
          `Thank you to everyone who helped make this event possible. Whether you came for the car wash, the ice cream, or the good company, we hope you had a wheel-y great time!`,
        ]),
    },
    {
      key: "happy-hour",
      title: () => "Happy Hour",
      articleType: "announcement",
      body: () =>
        "Our weekly Happy Hour celebrations from 3:00-5:00 p.m. are the perfect way to gather with friends, enjoy delicious treats, and create meaningful moments together.\n\n7/3 Red, White, and BOOZE\n7/10 Cruisin' Through Happy Hour\n7/17 Ink & Drink Happy Hour\n7/24 Gorgeous Grandma Day Happy Hour\n7/31 Surf's Up & Bottoms Up Happy Hour",
    },
    {
      key: "upcoming-events",
      title: () => "Upcoming Events",
      articleType: "announcement",
      sectionMatch: /calendar|activities|events/i,
      body: () =>
        paragraphs(input, [
          `Residents, families, and guests are invited to join us for Cruise Day: Setting Sail at the Springs. The day will include themed activities, refreshing stations, and a few lighthearted surprises around campus.`,
          `Join us for Break for Brunch, an elevated summertime Sunday Brunch celebration followed by our annual car show. Brunch will be served from 11:00 a.m. to 1:00 p.m., with classic cars and vintage favorites on display afterward.`,
          `Please RSVP so our team can prepare comfortably and make the day special for everyone who joins us.`,
        ]),
    },
    {
      key: "out-and-about",
      title: () => "Out and About",
      articleType: "announcement",
      body: () =>
        "From local attractions and community events to relaxing drives, shopping trips, sweet treats, and summer fun, our residents are ready to make the most of every sunny day ahead.\n\n7/2 Sugar Shack by the Tracks\n7/7 Newport Aquarium\n7/9 Sharon Park Fishing Trip\n7/14 Meijer Shopping Trip\n7/16 Butterfly Show at Krohn Conservatory\n7/21 Ford's Garage\n7/23 Washington Park Picnic\n7/28 Flub's Ice Cream\n7/30 Bluebird Bakery",
    },
    {
      key: "smile-of-the-month",
      title: () => "Smile of the Month",
      articleType: "resident-story",
      body: () =>
        paragraphs(input, [
          `Meet Robyn J. and learn a little more about her. Since joining our campus team, Robyn has created so many friendships during our monthly employee recognition celebrations.`,
          `Robyn's reliability, experience, and genuine kindness are integral pieces of our team. Her team-player spirit and warm personality make her an excellent addition to the family, and we are lucky to work with her.`,
          `In her free time, Robyn enjoys vacations, local restaurants, and shopping throughout the city. This summer we hope she joins our outings and declares a new favorite restaurant.`,
          `We are thankful for her continued patience, her nursing skills, and the way she brings care to every shift.`,
        ]),
    },
    {
      key: "make-the-difference",
      title: () => "Make the Difference",
      articleType: "announcement",
      body: () =>
        paragraphs(input, [
          `Becoming a volunteer is easy. Your skills, passions, and kindness can bring joy and comfort to residents all month long.`,
          `Whether you can volunteer once a week or once a month, your time and effort are greatly appreciated. Please contact the Life Enrichment Director to learn more about current opportunities.`,
          `Let us know if you have a favorite restaurant, local business, or park ready to serve us!`,
        ]),
    },
    {
      key: "trust-funds",
      title: () => "Trust Funds",
      articleType: "announcement",
      body: () =>
        paragraphs(input, [
          `At ${input.clientName ?? "our community"}, we are dedicated to supporting residents and loved ones in finding the best living solutions while maintaining independence and financial stability.`,
          `A Trust Fund is a secure arrangement that allows residents to manage assets while ensuring access to funds for daily living expenses and scheduled outings. Please visit the business office with questions or to establish a fund.`,
        ]),
    },
    {
      key: "uv-safety",
      title: () => "Protecting Your Skin During UV Safety Month",
      articleType: "announcement",
      sectionMatch: /feature|spotlight/i,
      body: () =>
        paragraphs(input, [
          `${monthName} is UV Safety Month, a good time to enjoy the sunshine while keeping skin protected. As we get older, skin can become more delicate and more sensitive to ultraviolet rays, so a few simple habits make a real difference.`,
          `Use a broad-spectrum sunscreen with an SPF of at least 30, and reapply it every two hours when spending time outside. Light long sleeves, wide-brimmed hats, and sunglasses with UV protection are smart choices for patio visits, walks, and family outings.`,
          `Plan outdoor time for the morning or late afternoon when possible, and look for shade during the strongest midday sun. Keep water nearby, check the forecast, and ask your doctor if you have questions about medications, skin history, or safe sun exposure.`,
          `Small choices add up. A hat by the door, sunscreen in a tote bag, and a glass of water before heading outside can help make this season both joyful and safe.`,
        ]),
    },
    {
      key: "staff-spot-ben",
      title: () => "Ben Gibbs",
      articleType: "announcement",
      body: () =>
        "Ben Gibbs, our Director of Food Services, brings 20 years of professional kitchen experience to campus. He studied culinary arts, loves the outdoors, and is happiest when a meal brings people together.",
    },
    {
      key: "staff-spot-kim",
      title: () => "Kim Messinger",
      articleType: "announcement",
      body: () =>
        "Kim Messinger, our Director of Assisted Living, has spent 35 years in nursing. Her career began as a CNA, and she continues to grow through healthcare administration, resident advocacy, and team mentoring.",
    },
    {
      key: "staff-spot-lindsay",
      title: () => "Lindsay Morse",
      articleType: "announcement",
      body: () =>
        "Lindsay Morse, our Executive Director, is passionate about person-centered care, resident advocacy, and staff development. She loves seeing families, neighbors, and team members make campus life feel connected.",
    },
    {
      key: "calendar",
      title: () => `${monthName} Campus Highlights`,
      articleType: "event-recap",
      sectionMatch: /calendar|activities|events/i,
      body: () =>
        paragraphs(input, [
          `This month's calendar brings together the best parts of summer: live music, cookouts, creative afternoons, devotional gatherings, and family-friendly time outside.`,
          `Residents can watch the posted activity calendar for final dates and times. Families are always welcome to plan visits around favorite programs or ask the life-enrichment team which events may be the best fit.`,
        ]),
    },
    {
      key: "best-friends",
      title: () => "The Best Friends Approach in Action",
      articleType: "resident-story",
      body: () =>
        paragraphs(input, [
          `The Best Friends Approach shows up in the little details: remembering a favorite song, saving a seat near a familiar neighbor, or knowing when a quiet walk is better than a busy room.`,
          `Those details help every resident feel known. They also give families more ways to share stories, routines, recipes, and memories that make each day more personal.`,
        ]),
    },
    {
      key: "summer-food",
      title: () => "Summer Flavors From the Kitchen",
      articleType: "announcement",
      body: () =>
        paragraphs(input, [
          `The kitchen is leaning into summer with crisp salads, grilled favorites, chilled desserts, and the kind of familiar dishes that bring people back for seconds.`,
          `Residents are encouraged to share favorite recipes or food memories with the dining team. A good menu starts with good stories.`,
        ]),
    },
  ];

  const orderedSeeds = orderTrilogyStories(seeds, input);

  const articles = Array.from({ length: targets.articles }, (_, index) => {
    const story = orderedSeeds[index % orderedSeeds.length];
    const cycle = Math.floor(index / orderedSeeds.length);
    const title = story.title(input);
    const section = input.recurringSections?.find((candidate) =>
      story.sectionMatch?.test(candidate.title),
    );
    const body = story.body(input);
    return {
      id: createId(),
      title: cycle > 0 ? `${title} Update` : title,
      body,
      wordCount: wordCount(body),
      byline: story.key === "director" ? "From the Executive Director" : undefined,
      sectionId: section?.id,
      isFiller: false,
      source: "MOCK" as const,
      articleType: story.articleType,
    };
  });

  const imageSeeds = orderTrilogyImages(input.scenario);
  const imageTarget = input.scenario === "photo-festival"
    ? Math.max(targets.images, 12)
    : input.scenario === "editorial-light"
      ? Math.min(targets.images, 4)
      : targets.images;
  const images = Array.from({ length: imageTarget }, (_, index) => {
    const seed = imageSeeds[index % imageSeeds.length];
    return {
      id: createId(),
      url: `${seed.url}?auto=format&fit=crop&w=1600&q=86&sig=trilogy-${index}`,
      caption: seed.caption,
      alt: seed.alt,
      aspect: seed.aspect,
      isPlaceholder: false,
      source: "MOCK" as const,
    };
  });

  return { articles, images };
}

function orderTrilogyStories(
  seeds: StorySeed[],
  input: GenerateMockContentInput,
): StorySeed[] {
  const scenarioOrder: Record<MockScenario, string[]> = {
    "community-classic": [
      "birthdays",
      "director",
      "happy-hour",
      "upcoming-events",
      "out-and-about",
      "smile-of-the-month",
      "make-the-difference",
      "trust-funds",
      "summer-food",
      "holiday",
    ],
    "panel-garden": [
      "director",
      "best-friends",
      "calendar",
      "summer-food",
      "upcoming-events",
      "trust-funds",
      "staff-spot-ben",
      "staff-spot-kim",
      "birthdays",
      "make-the-difference",
    ],
    "photo-festival": [
      "out-and-about",
      "scrubbly",
      "happy-hour",
      "upcoming-events",
      "holiday",
      "calendar",
      "summer-food",
      "smile-of-the-month",
      "staff-spot-lindsay",
      "director",
    ],
    "resident-feature": [
      "smile-of-the-month",
      "best-friends",
      "scrubbly",
      "director",
      "staff-spot-lindsay",
      "staff-spot-ben",
      "upcoming-events",
      "make-the-difference",
      "birthdays",
      "trust-funds",
    ],
    "editorial-light": [
      "director",
      "uv-safety",
      "best-friends",
      "trust-funds",
      "summer-food",
      "calendar",
      "make-the-difference",
      "birthdays",
    ],
  };
  const includeGroups: Record<string, string[]> = {
    director: ["director"],
    spotlight: ["scrubbly", "smile-of-the-month", "best-friends"],
    events: ["happy-hour", "upcoming-events", "out-and-about", "calendar", "holiday"],
    menu: ["summer-food"],
    opEd: ["uv-safety", "trust-funds", "make-the-difference"],
  };
  const allowedKeys = new Set(
    (input.include ?? [])
      .flatMap((key) => includeGroups[key] ?? [key])
      .concat(["birthdays"]),
  );
  const byKey = new Map(seeds.map((seed) => [seed.key, seed]));
  const preferredKeys = input.scenario ? scenarioOrder[input.scenario] : [];
  const ordered = [
    ...preferredKeys.flatMap((key) => {
      const seed = byKey.get(key);
      return seed ? [seed] : [];
    }),
    ...seeds.filter((seed) => !preferredKeys.includes(seed.key)),
  ];
  const filtered = input.include?.length
    ? ordered.filter((seed) => allowedKeys.has(seed.key))
    : ordered;
  return filtered.length ? filtered : ordered;
}

function orderTrilogyImages(scenario: MockScenario | undefined): Array<(typeof IMAGE_SEEDS)[number]> {
  const indexOrder: Record<MockScenario, number[]> = {
    "community-classic": [0, 1, 2, 3, 4],
    "panel-garden": [2, 0, 4, 3, 1],
    "photo-festival": [1, 2, 0, 3, 4],
    "resident-feature": [4, 1, 0, 2, 3],
    "editorial-light": [4, 0, 3, 2, 1],
  };
  const order = scenario ? indexOrder[scenario] : indexOrder["community-classic"];
  return order.map((index) => IMAGE_SEEDS[index]);
}

function normalizeDensity(density: number | undefined, richness: Richness): number {
  if (Number.isInteger(density)) return Math.min(4, Math.max(1, density ?? 1));
  return { SIMPLE: 1, MODERATE: 2, RICH: 3, EXTRA_RICH: 4 }[richness];
}

function paragraphs(input: GenerateMockContentInput, parts: string[]): string {
  const toneLead = {
    warm: "",
    formal: "In this edition, ",
    playful: "Here is something worth smiling about: ",
    civic: "Across our community, ",
  }[input.tone ?? "warm"];
  const first = toneLead ? toneLead + lowerFirst(parts[0]) : parts[0];
  return [first, ...parts.slice(1)].join("\n\n");
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function careInvitation(careLevel: CareLevel): string {
  switch (careLevel) {
    case "INDEPENDENT_LIVING":
      return "Residents can sign up at the front desk or invite a neighbor to join them.";
    case "ASSISTED_LIVING":
      return "Care partners can help with reminders, transportation, and comfortable participation.";
    case "MEMORY_CARE":
      return "Team members will adapt each activity around familiar routines and individual comfort.";
    case "MIXED":
      return "Programs will be adapted across neighborhoods so residents can participate comfortably.";
  }
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
