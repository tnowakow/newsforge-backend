/**
 * NewsForge seed. 25 clients spanning richness levels + care levels,
 * 10 templates with genuinely different grid specs.
 *
 * Stable IDs are seeded via @paralleldrive/cuid2's createId helper used as a
 * deterministic name -> id map, which keeps re-seeds idempotent.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  RecurringSectionsSchema,
  GridSpecSchema,
  SlotTypesSchema,
  CompatibilityHintsSchema,
  type RecurringSection,
  type GridSpec,
  type TemplateSlot,
  type SlotTypes,
  type ArticleType,
} from "@newsforge/shared/schemas";

const prisma = new PrismaClient();

// Deterministic 24-char id from a name (idempotent re-seeds).
function stableId(prefix: string, name: string): string {
  const h = createHash("sha256").update(`${prefix}::${name}`).digest("hex");
  // cuid-like: lowercase alphanumeric, 24 chars
  return `c${h.slice(0, 23)}`;
}

// ---------- Templates ----------

interface TemplateSeed {
  name: string;
  pageCount: number;
  grid: GridSpec;
  slotTypes: SlotTypes;
  hints: {
    richness: Array<"SIMPLE" | "MODERATE" | "RICH" | "EXTRA_RICH">;
    careLevels: Array<
      "INDEPENDENT_LIVING" | "ASSISTED_LIVING" | "MEMORY_CARE" | "MIXED"
    >;
    notes: string;
  };
}

function s(
  id: string,
  page: number,
  type: TemplateSlot["type"],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  capacity: TemplateSlot["capacity"] = {},
  styleTag?: string,
): TemplateSlot {
  return { id, page, type, col, row, colSpan, rowSpan, capacity, styleTag };
}

function tally(slots: TemplateSlot[]): SlotTypes {
  const acc: SlotTypes = {
    headline: 0,
    body: 0,
    image: 0,
    sidebar: 0,
    calendar: 0,
    spotlight: 0,
    filler: 0,
  };
  for (const sl of slots) acc[sl.type] += 1;
  return acc;
}

const TEMPLATES: TemplateSeed[] = [
  // 1. Simple 2-col, 2 pages
  (() => {
    const slots: TemplateSlot[] = [
      s("t1-p1-headline", 1, "headline", 1, 1, 12, 2, { maxWords: 60 }, "hero"),
      s("t1-p1-image", 1, "image", 1, 3, 6, 5, { aspect: "landscape" }),
      s("t1-p1-body1", 1, "body", 7, 3, 6, 5, { minWords: 100, maxWords: 240 }),
      s("t1-p1-sidebar", 1, "sidebar", 1, 8, 12, 2, { maxWords: 120 }),
      s("t1-p2-body1", 2, "body", 1, 1, 6, 5, { minWords: 120, maxWords: 280 }),
      s("t1-p2-body2", 2, "body", 7, 1, 6, 5, { minWords: 120, maxWords: 280 }),
      s("t1-p2-calendar", 2, "calendar", 1, 6, 12, 4, { maxWords: 200 }),
    ];
    return {
      name: "Classic 2-Column (Simple)",
      pageCount: 2,
      grid: { label: "2col-simple", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["SIMPLE", "MODERATE"],
        careLevels: ["MEMORY_CARE", "ASSISTED_LIVING"],
        notes: "Big type, plenty of breathing room. Best for SIMPLE clients.",
      },
    };
  })(),

  // 2. 3-col magazine, 4 pages
  (() => {
    const slots: TemplateSlot[] = [
      s("t2-p1-headline", 1, "headline", 1, 1, 12, 2, { maxWords: 80 }, "hero"),
      s("t2-p1-image", 1, "image", 1, 3, 8, 5, { aspect: "landscape" }, "hero"),
      s("t2-p1-spotlight", 1, "spotlight", 9, 3, 4, 5, { maxWords: 160 }),
      s("t2-p1-body1", 1, "body", 1, 8, 4, 4, { minWords: 120 }),
      s("t2-p1-body2", 1, "body", 5, 8, 4, 4, { minWords: 120 }),
      s("t2-p1-body3", 1, "body", 9, 8, 4, 4, { minWords: 120 }),
      s("t2-p2-body1", 2, "body", 1, 1, 4, 6, { minWords: 200 }),
      s("t2-p2-image1", 2, "image", 5, 1, 4, 3),
      s("t2-p2-body2", 2, "body", 5, 4, 4, 3, { maxWords: 180 }),
      s("t2-p2-body3", 2, "body", 9, 1, 4, 6, { minWords: 200 }),
      s("t2-p2-calendar", 2, "calendar", 1, 7, 12, 4),
      s("t2-p3-image1", 3, "image", 1, 1, 12, 4, { aspect: "landscape" }, "panorama"),
      s("t2-p3-body1", 3, "body", 1, 5, 6, 4),
      s("t2-p3-body2", 3, "body", 7, 5, 6, 4),
      s("t2-p3-sidebar", 3, "sidebar", 1, 9, 12, 2),
      s("t2-p4-spotlight", 4, "spotlight", 1, 1, 12, 4, { maxWords: 240 }),
      s("t2-p4-body1", 4, "body", 1, 5, 6, 5),
      s("t2-p4-image", 4, "image", 7, 5, 6, 5),
    ];
    return {
      name: "Magazine 3-Column (Rich)",
      pageCount: 4,
      grid: { label: "3col-magazine", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["RICH", "EXTRA_RICH"],
        careLevels: ["INDEPENDENT_LIVING", "MIXED"],
        notes: "Editorial feel with spotlight + panorama image.",
      },
    };
  })(),

  // 3. Photo-heavy 4 pages
  (() => {
    const slots: TemplateSlot[] = [
      s("t3-p1-headline", 1, "headline", 1, 1, 12, 1, { maxWords: 40 }),
      s("t3-p1-img1", 1, "image", 1, 2, 8, 6, { aspect: "landscape" }, "hero"),
      s("t3-p1-img2", 1, "image", 9, 2, 4, 3, { aspect: "portrait" }),
      s("t3-p1-img3", 1, "image", 9, 5, 4, 3, { aspect: "portrait" }),
      s("t3-p1-body", 1, "body", 1, 8, 12, 2, { maxWords: 150 }),
      s("t3-p2-img1", 2, "image", 1, 1, 6, 5),
      s("t3-p2-img2", 2, "image", 7, 1, 6, 5),
      s("t3-p2-img3", 2, "image", 1, 6, 4, 4),
      s("t3-p2-img4", 2, "image", 5, 6, 4, 4),
      s("t3-p2-img5", 2, "image", 9, 6, 4, 4),
      s("t3-p3-img1", 3, "image", 1, 1, 12, 5, { aspect: "landscape" }, "panorama"),
      s("t3-p3-body1", 3, "body", 1, 6, 6, 4),
      s("t3-p3-body2", 3, "body", 7, 6, 6, 4),
      s("t3-p4-calendar", 4, "calendar", 1, 1, 12, 6),
      s("t3-p4-sidebar", 4, "sidebar", 1, 7, 12, 3),
    ];
    return {
      name: "Photo Heavy (Memory Lane)",
      pageCount: 4,
      grid: { label: "photo-heavy", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["MODERATE", "RICH"],
        careLevels: ["MIXED", "INDEPENDENT_LIVING"],
        notes: "Image-forward. Great for community photo recaps.",
      },
    };
  })(),

  // 4. Text-heavy 6 pages
  (() => {
    const slots: TemplateSlot[] = [
      s("t4-p1-headline", 1, "headline", 1, 1, 12, 1),
      s("t4-p1-body1", 1, "body", 1, 2, 6, 8, { minWords: 350 }),
      s("t4-p1-body2", 1, "body", 7, 2, 6, 8, { minWords: 350 }),
      s("t4-p2-body1", 2, "body", 1, 1, 6, 10, { minWords: 400 }),
      s("t4-p2-body2", 2, "body", 7, 1, 6, 10, { minWords: 400 }),
      s("t4-p3-body1", 3, "body", 1, 1, 6, 10, { minWords: 400 }),
      s("t4-p3-body2", 3, "body", 7, 1, 6, 10, { minWords: 400 }),
      s("t4-p4-body1", 4, "body", 1, 1, 12, 5, { minWords: 600 }),
      s("t4-p4-image", 4, "image", 1, 6, 6, 5),
      s("t4-p4-body2", 4, "body", 7, 6, 6, 5),
      s("t4-p5-calendar", 5, "calendar", 1, 1, 12, 10),
      s("t4-p6-spotlight", 6, "spotlight", 1, 1, 12, 5),
      s("t4-p6-sidebar", 6, "sidebar", 1, 6, 12, 5),
    ];
    return {
      name: "Text Heavy Long-Form",
      pageCount: 6,
      grid: { label: "text-heavy", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["EXTRA_RICH"],
        careLevels: ["INDEPENDENT_LIVING", "MIXED"],
        notes: "For communities with strong contributor culture.",
      },
    };
  })(),

  // 5. Newspaper 6-col
  (() => {
    const slots: TemplateSlot[] = [
      s("t5-p1-headline", 1, "headline", 1, 1, 12, 2, { maxWords: 80 }, "banner"),
      s("t5-p1-body1", 1, "body", 1, 3, 4, 6, { minWords: 200 }),
      s("t5-p1-body2", 1, "body", 5, 3, 4, 6, { minWords: 200 }),
      s("t5-p1-body3", 1, "body", 9, 3, 4, 6, { minWords: 200 }),
      s("t5-p1-image", 1, "image", 1, 9, 12, 1),
      s("t5-p2-body1", 2, "body", 1, 1, 4, 5),
      s("t5-p2-body2", 2, "body", 5, 1, 4, 5),
      s("t5-p2-body3", 2, "body", 9, 1, 4, 5),
      s("t5-p2-body4", 2, "body", 1, 6, 4, 5),
      s("t5-p2-body5", 2, "body", 5, 6, 4, 5),
      s("t5-p2-body6", 2, "body", 9, 6, 4, 5),
      s("t5-p3-spotlight", 3, "spotlight", 1, 1, 12, 4),
      s("t5-p3-image", 3, "image", 1, 5, 6, 4),
      s("t5-p3-body", 3, "body", 7, 5, 6, 4),
      s("t5-p3-calendar", 3, "calendar", 1, 9, 12, 2),
    ];
    return {
      name: "Newspaper 6-Column",
      pageCount: 3,
      grid: { label: "newspaper-6col", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["RICH", "EXTRA_RICH"],
        careLevels: ["INDEPENDENT_LIVING", "MIXED"],
        notes: "Dense newsprint feel. Lots of short stories.",
      },
    };
  })(),

  // 6. Single column letter
  (() => {
    const slots: TemplateSlot[] = [
      s("t6-p1-headline", 1, "headline", 1, 1, 12, 2, { maxWords: 50 }),
      s("t6-p1-body", 1, "body", 1, 3, 12, 7, { minWords: 250 }),
      s("t6-p1-image", 1, "image", 1, 10, 12, 1, { aspect: "landscape" }),
      s("t6-p2-body", 2, "body", 1, 1, 12, 8),
      s("t6-p2-sidebar", 2, "sidebar", 1, 9, 12, 2),
    ];
    return {
      name: "Director's Letter (1-Column)",
      pageCount: 2,
      grid: { label: "1col-letter", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["SIMPLE", "MODERATE"],
        careLevels: ["ASSISTED_LIVING", "MEMORY_CARE", "MIXED"],
        notes: "Personal letter format. Very readable.",
      },
    };
  })(),

  // 7. Activity Calendar Focused
  (() => {
    const slots: TemplateSlot[] = [
      s("t7-p1-headline", 1, "headline", 1, 1, 12, 1),
      s("t7-p1-calendar", 1, "calendar", 1, 2, 12, 8, { maxWords: 400 }),
      s("t7-p1-sidebar", 1, "sidebar", 1, 10, 12, 1),
      s("t7-p2-body1", 2, "body", 1, 1, 6, 5),
      s("t7-p2-body2", 2, "body", 7, 1, 6, 5),
      s("t7-p2-image1", 2, "image", 1, 6, 6, 4),
      s("t7-p2-image2", 2, "image", 7, 6, 6, 4),
    ];
    return {
      name: "Calendar Forward",
      pageCount: 2,
      grid: { label: "calendar-forward", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["SIMPLE", "MODERATE", "RICH"],
        careLevels: ["INDEPENDENT_LIVING", "ASSISTED_LIVING", "MIXED"],
        notes: "Lead with the calendar; community sees activities first.",
      },
    };
  })(),

  // 8. Resident Spotlight Hero
  (() => {
    const slots: TemplateSlot[] = [
      s("t8-p1-headline", 1, "headline", 1, 1, 12, 1, {}, "kicker"),
      s("t8-p1-image", 1, "image", 1, 2, 6, 8, { aspect: "portrait" }, "hero-portrait"),
      s("t8-p1-spotlight", 1, "spotlight", 7, 2, 6, 8, { minWords: 300 }),
      s("t8-p2-body1", 2, "body", 1, 1, 6, 5),
      s("t8-p2-body2", 2, "body", 7, 1, 6, 5),
      s("t8-p2-image1", 2, "image", 1, 6, 4, 4),
      s("t8-p2-image2", 2, "image", 5, 6, 4, 4),
      s("t8-p2-image3", 2, "image", 9, 6, 4, 4),
      s("t8-p3-sidebar", 3, "sidebar", 1, 1, 12, 5),
      s("t8-p3-calendar", 3, "calendar", 1, 6, 12, 5),
    ];
    return {
      name: "Resident Spotlight",
      pageCount: 3,
      grid: { label: "spotlight-hero", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["MODERATE", "RICH", "EXTRA_RICH"],
        careLevels: ["INDEPENDENT_LIVING", "MIXED"],
        notes: "Lead with a portrait + long-form spotlight.",
      },
    };
  })(),

  // 9. Wellness focus
  (() => {
    const slots: TemplateSlot[] = [
      s("t9-p1-headline", 1, "headline", 1, 1, 12, 2),
      s("t9-p1-body1", 1, "body", 1, 3, 6, 5),
      s("t9-p1-image", 1, "image", 7, 3, 6, 5),
      s("t9-p1-sidebar", 1, "sidebar", 1, 8, 12, 2),
      s("t9-p2-body1", 2, "body", 1, 1, 4, 7),
      s("t9-p2-body2", 2, "body", 5, 1, 4, 7),
      s("t9-p2-body3", 2, "body", 9, 1, 4, 7),
      s("t9-p2-calendar", 2, "calendar", 1, 8, 12, 3),
    ];
    return {
      name: "Wellness & Activities",
      pageCount: 2,
      grid: { label: "wellness", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["MODERATE", "RICH"],
        careLevels: ["ASSISTED_LIVING", "MEMORY_CARE", "MIXED"],
        notes: "Health programming + group activities.",
      },
    };
  })(),

  // 10. Premium 8-page flagship
  (() => {
    const slots: TemplateSlot[] = [
      s("t10-p1-headline", 1, "headline", 1, 1, 12, 2, {}, "hero"),
      s("t10-p1-image", 1, "image", 1, 3, 12, 6, { aspect: "landscape" }, "cover"),
      s("t10-p1-body", 1, "body", 1, 9, 12, 2, { maxWords: 150 }),
      s("t10-p2-spotlight", 2, "spotlight", 1, 1, 12, 10),
      s("t10-p3-body1", 3, "body", 1, 1, 6, 5),
      s("t10-p3-body2", 3, "body", 7, 1, 6, 5),
      s("t10-p3-image", 3, "image", 1, 6, 12, 5, { aspect: "landscape" }),
      s("t10-p4-body1", 4, "body", 1, 1, 4, 6),
      s("t10-p4-body2", 4, "body", 5, 1, 4, 6),
      s("t10-p4-body3", 4, "body", 9, 1, 4, 6),
      s("t10-p4-calendar", 4, "calendar", 1, 7, 12, 4),
      s("t10-p5-image1", 5, "image", 1, 1, 6, 5),
      s("t10-p5-image2", 5, "image", 7, 1, 6, 5),
      s("t10-p5-image3", 5, "image", 1, 6, 4, 5),
      s("t10-p5-image4", 5, "image", 5, 6, 4, 5),
      s("t10-p5-image5", 5, "image", 9, 6, 4, 5),
      s("t10-p6-body1", 6, "body", 1, 1, 6, 5),
      s("t10-p6-body2", 6, "body", 7, 1, 6, 5),
      s("t10-p6-body3", 6, "body", 1, 6, 12, 5),
      s("t10-p7-spotlight", 7, "spotlight", 1, 1, 12, 6),
      s("t10-p7-sidebar", 7, "sidebar", 1, 7, 12, 4),
      s("t10-p8-calendar", 8, "calendar", 1, 1, 12, 6),
      s("t10-p8-body", 8, "body", 1, 7, 12, 4),
    ];
    return {
      name: "Premium Flagship (8 Pages)",
      pageCount: 8,
      grid: { label: "premium-8page", columns: 12, rowsPerPage: 10, slots },
      slotTypes: tally(slots),
      hints: {
        richness: ["EXTRA_RICH"],
        careLevels: ["INDEPENDENT_LIVING", "MIXED"],
        notes: "Flagship newsletter for big communities. Lots of content needed.",
      },
    };
  })(),
];

// ---------- Clients ----------

interface ClientSeed {
  name: string;
  tagline: string;
  city: string;
  careLevel: "INDEPENDENT_LIVING" | "ASSISTED_LIVING" | "MEMORY_CARE" | "MIXED";
  richnessLevel: "SIMPLE" | "MODERATE" | "RICH" | "EXTRA_RICH";
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  defaultTemplateIdx: number; // index into TEMPLATES
  pageCount: number;
  brandVoice: string;
  recurringSections: RecurringSection[];
}

const DEFAULT_SECTIONS = (): RecurringSection[] => [
  {
    id: "sec-director",
    title: "From the Director",
    slotHint: "headline",
    wordTarget: 220,
    required: true,
    description: "Warm monthly welcome from the Executive Director.",
  },
  {
    id: "sec-spotlight",
    title: "Resident Spotlight",
    slotHint: "spotlight",
    wordTarget: 280,
    required: true,
    description: "Profile of a featured resident this month.",
  },
  {
    id: "sec-calendar",
    title: "Activities Calendar",
    slotHint: "calendar",
    wordTarget: 180,
    required: true,
    description: "Highlights from the upcoming month's calendar.",
  },
  {
    id: "sec-birthdays",
    title: "Birthdays & Anniversaries",
    slotHint: "sidebar",
    wordTarget: 120,
    required: false,
    description: "Celebrating milestones in our community.",
  },
];

// Helper: distribute care levels and pick template by richness.
function templateForRichness(
  r: "SIMPLE" | "MODERATE" | "RICH" | "EXTRA_RICH",
  variant: number,
): number {
  if (r === "SIMPLE") return [0, 5, 6][variant % 3];     // simple / letter / calendar-forward
  if (r === "MODERATE") return [0, 2, 6, 8][variant % 4]; // simple / photo / cal / wellness
  if (r === "RICH") return [1, 2, 4, 7, 8][variant % 5];  // magazine / photo / newspaper / spotlight / wellness
  return [1, 3, 4, 7, 9][variant % 5];                    // magazine / text-heavy / newspaper / spotlight / premium
}

const CLIENTS: ClientSeed[] = [
  // 4 SIMPLE
  {
    name: "Maplewood Cottage",
    tagline: "A small home in the woods",
    city: "Burlington, VT",
    careLevel: "MEMORY_CARE",
    richnessLevel: "SIMPLE",
    primaryColor: "#3F5E3F",
    secondaryColor: "#A6B8A2",
    accentColor: "#D77A4C",
    headingFont: "Lora",
    bodyFont: "Source Sans Pro",
    defaultTemplateIdx: templateForRichness("SIMPLE", 0),
    pageCount: 2,
    brandVoice: "Gentle, calm, reassuring. Short sentences. Warm.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Hilltop Manor",
    tagline: "Comfort with a view",
    city: "Asheville, NC",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "SIMPLE",
    primaryColor: "#5B3A29",
    secondaryColor: "#C2A878",
    accentColor: "#7A9E7E",
    headingFont: "Merriweather",
    bodyFont: "Open Sans",
    defaultTemplateIdx: templateForRichness("SIMPLE", 1),
    pageCount: 2,
    brandVoice: "Warm, friendly, southern hospitality.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Willow Brook Care",
    tagline: "Family, always",
    city: "Eugene, OR",
    careLevel: "MEMORY_CARE",
    richnessLevel: "SIMPLE",
    primaryColor: "#2E5C76",
    secondaryColor: "#9CB7C7",
    accentColor: "#E4A04B",
    headingFont: "Playfair Display",
    bodyFont: "Lato",
    defaultTemplateIdx: templateForRichness("SIMPLE", 2),
    pageCount: 2,
    brandVoice: "Soft, soothing, memory-care attentive.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Cedar Grove",
    tagline: "Peace among the trees",
    city: "Boise, ID",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "SIMPLE",
    primaryColor: "#4A6A4F",
    secondaryColor: "#D5C9A0",
    accentColor: "#B05D3C",
    headingFont: "Cormorant Garamond",
    bodyFont: "Inter",
    defaultTemplateIdx: templateForRichness("SIMPLE", 0),
    pageCount: 2,
    brandVoice: "Quiet, dignified, formal.",
    recurringSections: DEFAULT_SECTIONS(),
  },

  // 6 MODERATE
  {
    name: "Sunrise Gardens",
    tagline: "Wake up to a brighter day",
    city: "Phoenix, AZ",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#E07A2D",
    secondaryColor: "#F2C76A",
    accentColor: "#2B6A8E",
    headingFont: "Montserrat",
    bodyFont: "Roboto",
    defaultTemplateIdx: templateForRichness("MODERATE", 0),
    pageCount: 4,
    brandVoice: "Upbeat, lively, energetic.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Riverbend Village",
    tagline: "Life flows beautifully here",
    city: "Portland, ME",
    careLevel: "MIXED",
    richnessLevel: "MODERATE",
    primaryColor: "#1F4E79",
    secondaryColor: "#BFD7EA",
    accentColor: "#E08B3C",
    headingFont: "Libre Baskerville",
    bodyFont: "PT Sans",
    defaultTemplateIdx: templateForRichness("MODERATE", 1),
    pageCount: 4,
    brandVoice: "Warm, coastal, neighborly.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Magnolia Place",
    tagline: "Roots that hold us together",
    city: "Charleston, SC",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#7E2D58",
    secondaryColor: "#D9B3C3",
    accentColor: "#5A8C5B",
    headingFont: "Cormorant",
    bodyFont: "Source Sans Pro",
    defaultTemplateIdx: templateForRichness("MODERATE", 2),
    pageCount: 4,
    brandVoice: "Southern, gracious, traditional.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Bluebird Estates",
    tagline: "Happiness has wings",
    city: "Madison, WI",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#3669A0",
    secondaryColor: "#A8C8E0",
    accentColor: "#F2A742",
    headingFont: "Poppins",
    bodyFont: "Nunito",
    defaultTemplateIdx: templateForRichness("MODERATE", 3),
    pageCount: 4,
    brandVoice: "Cheerful, friendly, midwestern.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Quail Ridge",
    tagline: "Together, naturally",
    city: "Tucson, AZ",
    careLevel: "MIXED",
    richnessLevel: "MODERATE",
    primaryColor: "#8B5E3C",
    secondaryColor: "#E0C9A6",
    accentColor: "#5B7E4F",
    headingFont: "Crimson Text",
    bodyFont: "Karla",
    defaultTemplateIdx: templateForRichness("MODERATE", 0),
    pageCount: 4,
    brandVoice: "Desert-warm, easygoing, sincere.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Heritage Oaks",
    tagline: "Where stories grow",
    city: "Nashville, TN",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#2F4858",
    secondaryColor: "#86B3C1",
    accentColor: "#D08A3E",
    headingFont: "Merriweather",
    bodyFont: "Lato",
    defaultTemplateIdx: templateForRichness("MODERATE", 1),
    pageCount: 4,
    brandVoice: "Storytelling, warm, classic Americana.",
    recurringSections: DEFAULT_SECTIONS(),
  },

  // 8 RICH
  {
    name: "The Promenade at Westover",
    tagline: "Live well, every day",
    city: "Arlington, VA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#1B3A57",
    secondaryColor: "#C8D6E5",
    accentColor: "#E4A03F",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans Pro",
    defaultTemplateIdx: templateForRichness("RICH", 0),
    pageCount: 6,
    brandVoice: "Elegant, polished, sophisticated.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Lakeshore Pavilion",
    tagline: "Every day, a little better",
    city: "Chicago, IL",
    careLevel: "MIXED",
    richnessLevel: "RICH",
    primaryColor: "#0E4D64",
    secondaryColor: "#9FC9D8",
    accentColor: "#F2B544",
    headingFont: "Libre Baskerville",
    bodyFont: "Inter",
    defaultTemplateIdx: templateForRichness("RICH", 1),
    pageCount: 6,
    brandVoice: "Urban, refined, contemporary.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Vista Pointe",
    tagline: "A new view of retirement",
    city: "Denver, CO",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#324C5C",
    secondaryColor: "#B3C7CD",
    accentColor: "#E07A39",
    headingFont: "Montserrat",
    bodyFont: "Open Sans",
    defaultTemplateIdx: templateForRichness("RICH", 2),
    pageCount: 6,
    brandVoice: "Active, mountain-modern, optimistic.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Crestwood Senior Living",
    tagline: "Rooted in community",
    city: "Atlanta, GA",
    careLevel: "MIXED",
    richnessLevel: "RICH",
    primaryColor: "#5A2D3C",
    secondaryColor: "#D6B8C0",
    accentColor: "#7CA45C",
    headingFont: "Cormorant Garamond",
    bodyFont: "Lato",
    defaultTemplateIdx: templateForRichness("RICH", 3),
    pageCount: 6,
    brandVoice: "Southern grace, deeply communal.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Brookhaven Estates",
    tagline: "Find your people",
    city: "Minneapolis, MN",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#214E34",
    secondaryColor: "#A6C4AE",
    accentColor: "#E6A23E",
    headingFont: "Merriweather",
    bodyFont: "Nunito Sans",
    defaultTemplateIdx: templateForRichness("RICH", 4),
    pageCount: 6,
    brandVoice: "Friendly, midwestern, community-first.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Ashford Court",
    tagline: "Carefully crafted living",
    city: "Boston, MA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#1A2B47",
    secondaryColor: "#B5C3D6",
    accentColor: "#C28B4B",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans Pro",
    defaultTemplateIdx: templateForRichness("RICH", 0),
    pageCount: 6,
    brandVoice: "New England classic, literary, refined.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Coral Bay Retirement",
    tagline: "Sunshine in every chapter",
    city: "Sarasota, FL",
    careLevel: "MIXED",
    richnessLevel: "RICH",
    primaryColor: "#0E6E7E",
    secondaryColor: "#A9D9DE",
    accentColor: "#F2724A",
    headingFont: "Quicksand",
    bodyFont: "Open Sans",
    defaultTemplateIdx: templateForRichness("RICH", 1),
    pageCount: 6,
    brandVoice: "Sunny, coastal, lively but unhurried.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Northgate Commons",
    tagline: "Vibrant living, every season",
    city: "Seattle, WA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#2C5F5D",
    secondaryColor: "#B0CFCD",
    accentColor: "#D88B3F",
    headingFont: "Lora",
    bodyFont: "Inter",
    defaultTemplateIdx: templateForRichness("RICH", 2),
    pageCount: 6,
    brandVoice: "Pacific Northwest, evergreen, thoughtful.",
    recurringSections: DEFAULT_SECTIONS(),
  },

  // 7 EXTRA_RICH
  {
    name: "The Grand at Beacon Hill",
    tagline: "Distinction in every detail",
    city: "Boston, MA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#16213E",
    secondaryColor: "#A6B4C8",
    accentColor: "#D4A24A",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans Pro",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 0),
    pageCount: 8,
    brandVoice: "Luxurious, literary, ceremonial.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Camellia Heights",
    tagline: "Where every story blooms",
    city: "Birmingham, AL",
    careLevel: "MIXED",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#7A1F3D",
    secondaryColor: "#E8C2D0",
    accentColor: "#3F7A52",
    headingFont: "Cormorant Garamond",
    bodyFont: "Lato",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 1),
    pageCount: 8,
    brandVoice: "Lush, Southern, story-rich.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "The Reserve at Cypress Lake",
    tagline: "Curated for a life well lived",
    city: "Naples, FL",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#0F4A55",
    secondaryColor: "#B6D4D9",
    accentColor: "#E0A53A",
    headingFont: "Libre Baskerville",
    bodyFont: "Inter",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 2),
    pageCount: 8,
    brandVoice: "Premium, resort-style, gracious.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Whitfield Manor",
    tagline: "Heritage meets tomorrow",
    city: "Greenwich, CT",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#1E3A2B",
    secondaryColor: "#B0C8B9",
    accentColor: "#B98A3B",
    headingFont: "Cormorant",
    bodyFont: "Source Sans Pro",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 3),
    pageCount: 8,
    brandVoice: "Old-world, polished, exacting.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Pacific Crest Communities",
    tagline: "Live the heights",
    city: "San Diego, CA",
    careLevel: "MIXED",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#103D5D",
    secondaryColor: "#9FC0D5",
    accentColor: "#F2933E",
    headingFont: "Montserrat",
    bodyFont: "Open Sans",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 4),
    pageCount: 8,
    brandVoice: "West-coast modern, sunny, ambitious.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Stonebridge Wellness Living",
    tagline: "Care of body, mind, spirit",
    city: "Princeton, NJ",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#3A4D6B",
    secondaryColor: "#BCC8DC",
    accentColor: "#D9844A",
    headingFont: "Merriweather",
    bodyFont: "Nunito",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 0),
    pageCount: 8,
    brandVoice: "Wellness-led, intentional, thoughtful.",
    recurringSections: DEFAULT_SECTIONS(),
  },
  {
    name: "Emberglow Senior Resort",
    tagline: "Every evening, a celebration",
    city: "Scottsdale, AZ",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#7F2D1F",
    secondaryColor: "#F0C2A3",
    accentColor: "#345A53",
    headingFont: "Poppins",
    bodyFont: "Inter",
    defaultTemplateIdx: templateForRichness("EXTRA_RICH", 1),
    pageCount: 8,
    brandVoice: "Resort-luxe, exuberant, golden hour.",
    recurringSections: DEFAULT_SECTIONS(),
  },
];

// ---------- v2: Trilogy client #26 + 5 templates + 20 filler entries ----------
// Purely additive. Never touches the 25 existing clients / 10 existing
// templates. Idempotent upserts keyed on stableId(...).

function trilogySlot(
  id: string,
  page: number,
  type: TemplateSlot["type"],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  capacity: TemplateSlot["capacity"] = {},
  styleTag?: string,
): TemplateSlot {
  return { id, page, type, col, row, colSpan, rowSpan, capacity, styleTag };
}

interface TrilogyTemplateSeed {
  stableName: string;
  displayName: string;
  pageCount: number;
  slots: TemplateSlot[];
}

// Templates T1..T5 from V2-BRAND-TRILOGY.md §5.
const TRILOGY_TEMPLATES: TrilogyTemplateSeed[] = [
  {
    stableName: "Trilogy Community Update",
    displayName: "Trilogy Community Update",
    pageCount: 4,
    slots: [
      trilogySlot("t-trilogy-cu-p1-birthdays", 1, "sidebar", 1, 1, 3, 2, { maxWords: 60 }, "birthday-box"),
      trilogySlot("t-trilogy-cu-p1-holiday", 1, "sidebar", 1, 3, 3, 3, { maxWords: 40 }, "holiday-box"),
      trilogySlot("t-trilogy-cu-p1-director", 1, "spotlight", 4, 1, 3, 5, { minWords: 220, maxWords: 320 }, "director-corner"),
      trilogySlot("t-trilogy-cu-p1-feature-headline", 1, "headline", 7, 1, 6, 1, { maxWords: 12 }, "hero"),
      trilogySlot("t-trilogy-cu-p1-feature-body", 1, "body", 7, 2, 6, 4, { minWords: 260, maxWords: 380 }, "feature"),
      trilogySlot("t-trilogy-cu-p1-feature-image", 1, "image", 7, 6, 6, 4, { aspect: "landscape" }, "hero"),
      trilogySlot("t-trilogy-cu-p1-spotlight-headline", 1, "headline", 1, 6, 6, 1, { maxWords: 6 }, "kicker"),
      trilogySlot("t-trilogy-cu-p1-spotlight-a", 1, "body", 1, 7, 2, 2, { minWords: 80, maxWords: 130 }, "staff-spot"),
      trilogySlot("t-trilogy-cu-p1-spotlight-b", 1, "body", 3, 7, 2, 2, { minWords: 80, maxWords: 130 }, "staff-spot"),
      trilogySlot("t-trilogy-cu-p1-spotlight-c", 1, "body", 5, 7, 2, 2, { minWords: 80, maxWords: 130 }, "staff-spot"),
      trilogySlot("t-trilogy-cu-p1-spot-img-a", 1, "image", 1, 9, 2, 2, { aspect: "square" }, "portrait"),
      trilogySlot("t-trilogy-cu-p1-spot-img-b", 1, "image", 3, 9, 2, 2, { aspect: "square" }, "portrait"),
      trilogySlot("t-trilogy-cu-p1-spot-img-c", 1, "image", 5, 9, 2, 2, { aspect: "square" }, "portrait"),
      // Pages 2–4 pattern: 2 body + 1 image + 1 sidebar.
      trilogySlot("t-trilogy-cu-p2-body-a", 2, "body", 1, 1, 6, 5, { minWords: 180, maxWords: 300 }),
      trilogySlot("t-trilogy-cu-p2-body-b", 2, "body", 7, 1, 6, 5, { minWords: 180, maxWords: 300 }),
      trilogySlot("t-trilogy-cu-p2-image", 2, "image", 1, 6, 12, 3, { aspect: "landscape" }),
      trilogySlot("t-trilogy-cu-p2-sidebar", 2, "sidebar", 1, 9, 12, 2, { maxWords: 120 }),
      trilogySlot("t-trilogy-cu-p3-body-a", 3, "body", 1, 1, 6, 5, { minWords: 180, maxWords: 300 }),
    ],
  },
  {
    stableName: "Trilogy Community Briefing",
    displayName: "Trilogy Community Briefing",
    pageCount: 4,
    slots: [
      trilogySlot("t-trilogy-cb-p1-banner", 1, "headline", 1, 1, 12, 1, { maxWords: 14 }, "banner"),
      trilogySlot("t-trilogy-cb-p1-lede-headline", 1, "headline", 1, 2, 6, 1, { maxWords: 10 }, "hero"),
      trilogySlot("t-trilogy-cb-p1-lede-body", 1, "body", 1, 3, 6, 6, { minWords: 300, maxWords: 420 }, "feature"),
      trilogySlot("t-trilogy-cb-p1-hero-image", 1, "image", 7, 2, 6, 7, { aspect: "portrait" }, "hero-portrait"),
      trilogySlot("t-trilogy-cb-p1-quote", 1, "spotlight", 1, 9, 12, 2, { maxWords: 60 }, "pull-quote"),
      // Pages 2–4 — 3-body layout with calendar on page 4.
      trilogySlot("t-trilogy-cb-p2-body-a", 2, "body", 1, 1, 6, 5),
      trilogySlot("t-trilogy-cb-p2-body-b", 2, "body", 7, 1, 6, 5),
      trilogySlot("t-trilogy-cb-p2-image", 2, "image", 1, 6, 12, 5),
      trilogySlot("t-trilogy-cb-p3-body-a", 3, "body", 1, 1, 6, 10),
      trilogySlot("t-trilogy-cb-p3-body-b", 3, "body", 7, 1, 6, 10),
      trilogySlot("t-trilogy-cb-p4-calendar", 4, "calendar", 1, 1, 12, 6),
      trilogySlot("t-trilogy-cb-p4-sidebar", 4, "sidebar", 1, 7, 12, 4),
    ],
  },
  {
    stableName: "Trilogy Feature Story",
    displayName: "Trilogy Feature Story",
    pageCount: 4,
    slots: [
      trilogySlot("t-trilogy-fs-p1-kicker", 1, "headline", 1, 1, 12, 1, { maxWords: 8 }, "kicker"),
      trilogySlot("t-trilogy-fs-p1-headline", 1, "headline", 1, 2, 12, 1, { maxWords: 14 }, "hero"),
      trilogySlot("t-trilogy-fs-p1-hero-image", 1, "image", 1, 3, 12, 4, { aspect: "landscape" }, "hero"),
      trilogySlot("t-trilogy-fs-p1-body", 1, "body", 1, 7, 8, 4, { minWords: 420, maxWords: 620 }, "feature"),
      trilogySlot("t-trilogy-fs-p1-sidebar", 1, "sidebar", 9, 7, 4, 4, { maxWords: 140 }, "facts"),
      trilogySlot("t-trilogy-fs-p2-body-a", 2, "body", 1, 1, 6, 6),
      trilogySlot("t-trilogy-fs-p2-body-b", 2, "body", 7, 1, 6, 6),
      trilogySlot("t-trilogy-fs-p2-image", 2, "image", 1, 7, 12, 4),
      trilogySlot("t-trilogy-fs-p3-body-a", 3, "body", 1, 1, 6, 10),
      trilogySlot("t-trilogy-fs-p3-body-b", 3, "body", 7, 1, 6, 10),
      trilogySlot("t-trilogy-fs-p4-calendar", 4, "calendar", 1, 1, 12, 6),
      trilogySlot("t-trilogy-fs-p4-birthdays", 4, "sidebar", 1, 7, 12, 4),
    ],
  },
  {
    stableName: "Trilogy Photo-Forward",
    displayName: "Trilogy Photo-Forward",
    pageCount: 4,
    slots: [
      trilogySlot("t-trilogy-pf-p1-headline", 1, "headline", 1, 1, 12, 1, { maxWords: 12 }, "banner"),
      trilogySlot("t-trilogy-pf-p1-hero-image", 1, "image", 1, 2, 12, 5, { aspect: "landscape" }, "panorama"),
      trilogySlot("t-trilogy-pf-p1-recap", 1, "body", 1, 7, 12, 3, { minWords: 160, maxWords: 240 }, "recap"),
      trilogySlot("t-trilogy-pf-p1-cta", 1, "sidebar", 1, 10, 12, 1, { maxWords: 30 }, "cta"),
      // Page 2 photo grid 3x2
      trilogySlot("t-trilogy-pf-p2-i1", 2, "image", 1, 1, 4, 5),
      trilogySlot("t-trilogy-pf-p2-i2", 2, "image", 5, 1, 4, 5),
      trilogySlot("t-trilogy-pf-p2-i3", 2, "image", 9, 1, 4, 5),
      trilogySlot("t-trilogy-pf-p2-i4", 2, "image", 1, 6, 4, 5),
      trilogySlot("t-trilogy-pf-p2-i5", 2, "image", 5, 6, 4, 5),
      trilogySlot("t-trilogy-pf-p2-i6", 2, "image", 9, 6, 4, 5),
      // Page 3 photo grid 3x2
      trilogySlot("t-trilogy-pf-p3-i1", 3, "image", 1, 1, 4, 5),
      trilogySlot("t-trilogy-pf-p3-i2", 3, "image", 5, 1, 4, 5),
      trilogySlot("t-trilogy-pf-p3-i3", 3, "image", 9, 1, 4, 5),
      trilogySlot("t-trilogy-pf-p3-i4", 3, "image", 1, 6, 4, 5),
      // Page 4
      trilogySlot("t-trilogy-pf-p4-i1", 4, "image", 1, 1, 6, 5),
      trilogySlot("t-trilogy-pf-p4-i2", 4, "image", 7, 1, 6, 5),
      trilogySlot("t-trilogy-pf-p4-sidebar", 4, "sidebar", 1, 6, 12, 5, { maxWords: 160 }, "thank-you"),
    ],
  },
  {
    stableName: "Trilogy Announcement + Events",
    displayName: "Trilogy Announcement + Events",
    pageCount: 4,
    slots: [
      trilogySlot("t-trilogy-ae-p1-kicker", 1, "headline", 1, 1, 12, 1, { maxWords: 6 }, "kicker"),
      trilogySlot("t-trilogy-ae-p1-headline", 1, "headline", 1, 2, 12, 1, { maxWords: 12 }, "hero"),
      trilogySlot("t-trilogy-ae-p1-announcement-body", 1, "spotlight", 1, 3, 8, 6, { minWords: 260, maxWords: 380 }, "announcement"),
      trilogySlot("t-trilogy-ae-p1-portrait", 1, "image", 9, 3, 4, 6, { aspect: "portrait" }, "portrait"),
      trilogySlot("t-trilogy-ae-p1-quote", 1, "sidebar", 1, 9, 12, 2, { maxWords: 40 }, "pull-quote"),
      trilogySlot("t-trilogy-ae-p2-calendar", 2, "calendar", 1, 1, 12, 7),
      trilogySlot("t-trilogy-ae-p2-body-a", 2, "body", 1, 8, 6, 3),
      trilogySlot("t-trilogy-ae-p2-body-b", 2, "body", 7, 8, 6, 3),
      trilogySlot("t-trilogy-ae-p3-calendar", 3, "calendar", 1, 1, 12, 7),
      trilogySlot("t-trilogy-ae-p3-body-a", 3, "body", 1, 8, 6, 3),
      trilogySlot("t-trilogy-ae-p3-body-b", 3, "body", 7, 8, 6, 3),
      trilogySlot("t-trilogy-ae-p4-birthdays", 4, "sidebar", 1, 1, 12, 4, {}, "birthday-box"),
      trilogySlot("t-trilogy-ae-p4-wellness", 4, "body", 1, 5, 8, 6),
      trilogySlot("t-trilogy-ae-p4-image", 4, "image", 9, 5, 4, 6),
    ],
  },
];

// Trilogy filler library from V2-BRAND-TRILOGY.md §6 (verbatim).
interface TrilogyFillerSeed {
  id: string;
  articleType: ArticleType;
  title: string;
  body: string;
  wordCount: number;
  tags: string[];
}

const TRILOGY_FILLER: TrilogyFillerSeed[] = [
  { id: "trilogy-filler-001", articleType: "executive-note", title: "A Note From the Executive Director", body: "Happy month, everyone! It has been a beautiful season on campus. From live music on the patio to afternoon walks and catch-ups over coffee, our Daily Rhythms are humming. Thank you to every family member who joined us this month — your presence turns our house into a home. Yours in service, the Executive Director's Office.", wordCount: 62, tags: ["trilogy"] },
  { id: "trilogy-filler-002", articleType: "resident-story", title: "Remembering the Good Old Days: A Sunday Drive", body: "Ask most of our residents about a Sunday afternoon in the 1950s and their eyes light up. Piling into the family car for a country drive, stopping at a roadside diner for a slice of pie — those were the days when the whole week slowed down for a single quiet ride. We keep those memories alive every day through the Best Friends Approach, one story, one favorite song, one shared laugh at a time.", wordCount: 76, tags: ["trilogy"] },
  { id: "trilogy-filler-003", articleType: "event-recap", title: "A Beautiful Afternoon at the Family Picnic", body: "Grandchildren, dogs, potato salad, and more sunshine than we knew what to do with — this year's family picnic was one for the scrapbooks. The dance floor filled up before the burgers were even off the grill, and the sing-along around the piano at sunset had the whole courtyard smiling. Thank you to every family who made the trip. Our community shines brightest when yours is with us.", wordCount: 68, tags: ["trilogy"] },
  { id: "trilogy-filler-004", articleType: "announcement", title: "Welcome to Our Newest Team Members", body: "Please help us welcome the newest members of our care team this month. Each one brings warmth, skill, and a genuine belief that this work is a calling. If you see a new face in the halls, say hello — they came here to be part of the family, and we are already so glad they did.", wordCount: 59, tags: ["trilogy"] },
  { id: "trilogy-filler-005", articleType: "birthday", title: "Celebrating Birthdays This Month", body: "This month our community celebrates birthdays for residents and team members alike. From decade milestones to quiet family dinners in the private dining room, every birthday here gets its own moment. Stop by the front desk to see the birthday wall — and don't be shy about singing along in the dining room when it's someone's day.", wordCount: 60, tags: ["trilogy"] },
  { id: "trilogy-filler-006", articleType: "resident-story", title: "A Life Well Lived, One Recipe at a Time", body: "For one of our residents, memory doesn't live in photographs — it lives in a well-worn recipe box. Every card is a story: her grandmother's biscuits, her husband's favorite chili, the pie that won the county fair in 1967. Some afternoons the kitchen team pulls a card and cooks it together with her. Those are Daily Rhythms at their sweetest.", wordCount: 66, tags: ["trilogy"] },
  { id: "trilogy-filler-007", articleType: "event-recap", title: "Live Music on the Patio", body: "Our summer patio concert series has been a highlight of the season. Big-band standards one week, church hymns the next, and a Motown night that had toes tapping all the way down the hallway. Music has a way of reaching everyone here, and we're grateful for every performer who has shared their gift with our community.", wordCount: 60, tags: ["trilogy"] },
  { id: "trilogy-filler-008", articleType: "announcement", title: "Flu Shot Clinic — Save the Date", body: "Our annual flu shot clinic will be held on campus later this month. All residents, family members, and team members are encouraged to participate. Watch the elevator boards for the schedule, and see the front desk if you have any questions. A quick jab now is one of the kindest things we do for one another.", wordCount: 62, tags: ["trilogy"] },
  { id: "trilogy-filler-009", articleType: "resident-story", title: "How the Best Friends Approach Shapes Our Days", body: "The Best Friends Approach is more than a memory-care philosophy — it's how we spend every hour on this campus. Knowing a resident's favorite flower, the name of their first dog, the song they danced to at their wedding: these are the details that turn care into companionship. We invite every family to help us build that story.", wordCount: 63, tags: ["trilogy"] },
  { id: "trilogy-filler-010", articleType: "event-recap", title: "Ice Cream Social a Sweet Success", body: "The ice cream social was a hit — three flavors, warm brownies, and a line out the door. Kids and grandkids helped scoop, and one of our residents told us it was the best root beer float she'd had since her high school days. Simple joys, shared in good company, are what our Daily Rhythms are all about.", wordCount: 63, tags: ["trilogy"] },
  { id: "trilogy-filler-011", articleType: "executive-note", title: "Thank You From Our Care Team", body: "A quick thank-you from all of us on the care team. Your patience during last month's system upgrade helped us keep our attention on what matters most — our residents. Small moments of grace like that are exactly what make this community special. Yours in service, the whole team.", wordCount: 51, tags: ["trilogy"] },
  { id: "trilogy-filler-012", articleType: "announcement", title: "New Wellness Programming Launches This Month", body: "We're excited to launch a new wellness series this month, built around the interests our residents have been asking for. Chair yoga on Tuesdays, walking club on Thursdays, and a monthly guest speaker on healthy aging. Watch the activity calendar for the full schedule and drop by any session — no sign-up required.", wordCount: 58, tags: ["trilogy"] },
  { id: "trilogy-filler-013", articleType: "resident-story", title: "A Veteran's Story, Passed Down at the Kitchen Table", body: "One of our residents served in Korea in the early 1950s, and this Memorial Day he shared his story with a small circle of neighbors over coffee. He spoke softly, but every word landed. We are proud, always, to be home to the men and women who wore the uniform, and we thank every family for trusting us with their stories.", wordCount: 69, tags: ["trilogy"] },
  { id: "trilogy-filler-014", articleType: "event-recap", title: "Family Movie Night in the Great Room", body: "The great room turned into a proper movie theater last Friday — popcorn buckets, dimmed lights, and a classic that everyone remembered from opening night. Grandkids curled up on the rug, and one of our couples held hands the whole way through. The good old days aren't behind us. They happen here, most Friday nights.", wordCount: 61, tags: ["trilogy"] },
  { id: "trilogy-filler-015", articleType: "birthday", title: "A Milestone Birthday to Celebrate", body: "This month we mark a milestone birthday in our community — a full nine decades of stories, seasons, and family lore. We'll gather in the private dining room to celebrate quietly, with the birthday resident's favorite cake and a slideshow of photos from her family. Please join us in wishing her a joyful year ahead.", wordCount: 58, tags: ["trilogy"] },
  { id: "trilogy-filler-016", articleType: "announcement", title: "Volunteer Opportunities This Season", body: "We're inviting family and friends to join our volunteer roster this season. Whether it's leading a craft afternoon, calling bingo, or reading aloud one-on-one, an hour of your time changes someone's whole week. Talk to our life-enrichment team for the current openings and to walk through our simple background-check process.", wordCount: 55, tags: ["trilogy"] },
  { id: "trilogy-filler-017", articleType: "resident-story", title: "Green Thumbs at Work in the Courtyard Garden", body: "The courtyard garden has never looked better, and it's thanks to a small group of residents who take turns tending the raised beds. Tomatoes, zinnias, and one very determined watermelon vine are all thriving. Every harvest ends up on the dining room tables — a farm-to-fork moment straight out of the good old days.", wordCount: 58, tags: ["trilogy"] },
  { id: "trilogy-filler-018", articleType: "event-recap", title: "Baking Day: The Kitchen Smelled Like Home", body: "The whole first floor smelled like cinnamon and butter last week — baking day is always a favorite. Residents rolled dough at the counter, kids stopped by after school to help decorate, and the finished cookies made their way to every neighbor on the memory-care wing. That, right there, is community.", wordCount: 55, tags: ["trilogy"] },
  { id: "trilogy-filler-019", articleType: "executive-note", title: "Looking Ahead to Fall", body: "As we start looking toward fall, our team is planning a season of family programming that honors the traditions our residents love most — Sunday suppers, football on the big screen, and a harvest celebration on the courtyard. Watch the calendar and please save the dates. This is your home too, and we love when you come by.", wordCount: 63, tags: ["trilogy"] },
  { id: "trilogy-filler-020", articleType: "other", title: "A Word of Thanks From Our Community", body: "Every month brings new reminders of why we chose this work — the notes tucked into the front desk, the hugs in the hallway, the laughter drifting out of the dining room. Thank you to the residents, families, and team members who make this community what it is. We are honored to walk these Daily Rhythms with you.", wordCount: 62, tags: ["trilogy"] },
];

// v2 additive brand kit for Trilogy — 13 tokens stashed on AssetLibrary.meta.
const TRILOGY_BRAND_KIT_EXTENDED = {
  version: 1,
  fontStack: {
    serif: ["Garamond Premier Pro", "EB Garamond", "Georgia", "serif"],
    serifDisplay: ["Garamond Premier Pro Display", "EB Garamond", "Georgia", "serif"],
    sans: ["Museo Sans", "Nunito Sans", "Segoe UI", "system-ui", "sans-serif"],
  },
  tokens: {
    "sky-primary": "#4FB6D9",
    "sky-deep": "#1F7EA5",
    "sky-soft": "#B6DFED",
    "sun-primary": "#F2B347",
    "sun-soft": "#FCE7B5",
    "berry-accent": "#C43F5A",
    "berry-deep": "#7A1F30",
    "sage-accent": "#7CA45C",
    parchment: "#F7EFD8",
    cream: "#FBF6E9",
    ink: "#1D2A32",
    "ink-soft": "#4B5860",
    hairline: "#D9CFB4",
  },
};

async function main() {
  console.log("🌱 Seeding NewsForge...");

  // ---- Templates ----
  const templateIdsByName = new Map<string, string>();
  for (const t of TEMPLATES) {
    const id = stableId("template", t.name);
    templateIdsByName.set(t.name, id);

    // Validate JSON columns
    GridSpecSchema.parse(t.grid);
    SlotTypesSchema.parse(t.slotTypes);
    CompatibilityHintsSchema.parse(t.hints);

    await prisma.template.upsert({
      where: { id },
      update: {
        name: t.name,
        pageCount: t.pageCount,
        gridSpec: t.grid as unknown as object,
        slotTypes: t.slotTypes as unknown as object,
        compatibilityHints: t.hints as unknown as object,
      },
      create: {
        id,
        name: t.name,
        pageCount: t.pageCount,
        gridSpec: t.grid as unknown as object,
        slotTypes: t.slotTypes as unknown as object,
        compatibilityHints: t.hints as unknown as object,
      },
    });
  }
  console.log(`  ✓ Upserted ${TEMPLATES.length} templates`);

  // ---- v2: Trilogy templates (additive) ----
  for (const tt of TRILOGY_TEMPLATES) {
    const id = stableId("template", tt.stableName);
    templateIdsByName.set(tt.stableName, id);
    const grid: GridSpec = {
      label: `trilogy-${tt.stableName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      columns: 12,
      rowsPerPage: 10,
      slots: tt.slots,
    };
    const slotTypes: SlotTypes = {
      headline: 0, body: 0, image: 0, sidebar: 0, calendar: 0, spotlight: 0, filler: 0,
    };
    for (const s of tt.slots) slotTypes[s.type] += 1;
    const hints = {
      richness: ["RICH", "EXTRA_RICH"] as ("RICH" | "EXTRA_RICH")[],
      careLevels: ["MIXED"] as ("MIXED")[],
      notes: `Trilogy-only template. [trilogy] tag. ${tt.displayName}.`,
    };
    GridSpecSchema.parse(grid);
    SlotTypesSchema.parse(slotTypes);
    CompatibilityHintsSchema.parse(hints);
    await prisma.template.upsert({
      where: { id },
      update: {
        name: tt.displayName,
        pageCount: tt.pageCount,
        gridSpec: grid as unknown as object,
        slotTypes: slotTypes as unknown as object,
        compatibilityHints: hints as unknown as object,
      },
      create: {
        id,
        name: tt.displayName,
        pageCount: tt.pageCount,
        gridSpec: grid as unknown as object,
        slotTypes: slotTypes as unknown as object,
        compatibilityHints: hints as unknown as object,
      },
    });
  }
  console.log(`  ✓ Upserted ${TRILOGY_TEMPLATES.length} Trilogy templates (v2 additive)`);

  // ---- Clients ----
  for (const c of CLIENTS) {
    const id = stableId("client", c.name);
    const templateName = TEMPLATES[c.defaultTemplateIdx].name;
    const defaultTemplateId = templateIdsByName.get(templateName)!;

    RecurringSectionsSchema.parse(c.recurringSections);

    await prisma.client.upsert({
      where: { id },
      update: {
        name: c.name,
        tagline: c.tagline,
        city: c.city,
        careLevel: c.careLevel,
        richnessLevel: c.richnessLevel,
        logoUrl: c.logoUrl ?? null,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor,
        accentColor: c.accentColor,
        headingFont: c.headingFont,
        bodyFont: c.bodyFont,
        defaultTemplateId,
        pageCount: c.pageCount,
        recurringSections: c.recurringSections as unknown as object,
        brandVoice: c.brandVoice,
      },
      create: {
        id,
        name: c.name,
        tagline: c.tagline,
        city: c.city,
        careLevel: c.careLevel,
        richnessLevel: c.richnessLevel,
        logoUrl: c.logoUrl ?? null,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor,
        accentColor: c.accentColor,
        headingFont: c.headingFont,
        bodyFont: c.bodyFont,
        defaultTemplateId,
        pageCount: c.pageCount,
        recurringSections: c.recurringSections as unknown as object,
        brandVoice: c.brandVoice,
      },
    });
  }
  console.log(`  ✓ Upserted ${CLIENTS.length} clients`);

  // ---- v2: Ensure bleed/safe/crop defaults on ALL existing clients ----
  // Idempotent — sets the same defaults every re-seed.
  await prisma.client.updateMany({
    where: {},
    data: {
      bleedInches: 0.125,
      safeAreaInches: 0.25,
      cropMarksEnabled: true,
    },
  });
  console.log("  ✓ Ensured bleed/safe/crop defaults on all clients");

  // ---- v2: Trilogy client #26 (additive) ----
  const trilogyId = stableId("client", "Trilogy Health Services");
  const trilogyTemplateId = templateIdsByName.get("Trilogy Community Update")!;
  const trilogyRecurring: RecurringSection[] = [
    { id: "sec-director", title: "From the Director", slotHint: "spotlight", wordTarget: 260, required: true, description: "Warm monthly note from the Executive Director." },
    { id: "sec-spotlight", title: "Feature Story", slotHint: "body", wordTarget: 320, required: true, description: "The month's feature article (resident story, program launch, or event recap)." },
    { id: "sec-calendar", title: "Activities Calendar", slotHint: "calendar", wordTarget: 180, required: false, description: "Upcoming activities." },
    { id: "sec-birthdays", title: "Birthdays & Anniversaries", slotHint: "sidebar", wordTarget: 60, required: false, description: "Celebrating milestones this month." },
  ];
  RecurringSectionsSchema.parse(trilogyRecurring);
  await prisma.client.upsert({
    where: { id: trilogyId },
    update: {
      name: "Trilogy Health Services",
      tagline: "Daily Rhythms. Best Friends Approach. The good old days.",
      city: "Louisville, KY",
      careLevel: "MIXED",
      richnessLevel: "RICH",
      // Trilogy monogram — sage/cream/purple per brand kit (V2-BRAND-TRILOGY.md).
      logoUrl: "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="116" fill="#5164a9"/><circle cx="120" cy="120" r="98" fill="none" stroke="#fdf5ec" stroke-width="4"/><text x="120" y="148" font-family="Georgia,serif" font-size="90" font-weight="700" text-anchor="middle" fill="#fdf5ec">TH</text></svg>').toString("base64"),
      primaryColor: "#4FB6D9",
      secondaryColor: "#1F7EA5",
      accentColor: "#F2B347",
      headingFont: "Garamond Premier Pro Display",
      bodyFont: "Garamond Premier Pro",
      defaultTemplateId: trilogyTemplateId,
      pageCount: 4,
      recurringSections: trilogyRecurring as unknown as object,
      brandVoice: "Mission-driven, warm, community-first. Daily Rhythms. Best Friends Approach. Conversational, never clinical.",
      bleedInches: 0.125,
      safeAreaInches: 0.25,
      cropMarksEnabled: true,
    },
    create: {
      id: trilogyId,
      name: "Trilogy Health Services",
      tagline: "Daily Rhythms. Best Friends Approach. The good old days.",
      city: "Louisville, KY",
      careLevel: "MIXED",
      richnessLevel: "RICH",
      logoUrl: "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="116" fill="#5164a9"/><circle cx="120" cy="120" r="98" fill="none" stroke="#fdf5ec" stroke-width="4"/><text x="120" y="148" font-family="Georgia,serif" font-size="90" font-weight="700" text-anchor="middle" fill="#fdf5ec">TH</text></svg>').toString("base64"),
      primaryColor: "#4FB6D9",
      secondaryColor: "#1F7EA5",
      accentColor: "#F2B347",
      headingFont: "Garamond Premier Pro Display",
      bodyFont: "Garamond Premier Pro",
      defaultTemplateId: trilogyTemplateId,
      pageCount: 4,
      recurringSections: trilogyRecurring as unknown as object,
      brandVoice: "Mission-driven, warm, community-first. Daily Rhythms. Best Friends Approach. Conversational, never clinical.",
      bleedInches: 0.125,
      safeAreaInches: 0.25,
      cropMarksEnabled: true,
    },
  });
  console.log("  ✓ Upserted Trilogy client (#26)");

  // ---- v2: Trilogy extended brand kit stashed on AssetLibrary.meta ----
  const brandKitAssetId = stableId("asset", "trilogy-brand-kit-extended");
  await prisma.assetLibrary.upsert({
    where: { id: brandKitAssetId },
    update: {
      clientId: trilogyId,
      type: "ARTICLE",
      contentOrUrl: "TRILOGY_BRAND_KIT_EXTENDED",
      source: "MOCK",
      meta: {
        kind: "brand-kit-extended",
        client: "trilogy",
        brandKitExtended: TRILOGY_BRAND_KIT_EXTENDED,
      },
    },
    create: {
      id: brandKitAssetId,
      clientId: trilogyId,
      type: "ARTICLE",
      contentOrUrl: "TRILOGY_BRAND_KIT_EXTENDED",
      source: "MOCK",
      meta: {
        kind: "brand-kit-extended",
        client: "trilogy",
        brandKitExtended: TRILOGY_BRAND_KIT_EXTENDED,
      },
    },
  });
  console.log("  ✓ Upserted Trilogy extended brand kit (AssetLibrary.meta)");

  // ---- v2: Trilogy filler library (~20 entries) ----
  for (const f of TRILOGY_FILLER) {
    await prisma.assetLibrary.upsert({
      where: { id: f.id },
      update: {
        clientId: trilogyId,
        type: "ARTICLE",
        contentOrUrl: f.body,
        source: "MOCK",
        meta: {
          title: f.title,
          articleType: f.articleType,
          wordCount: f.wordCount,
          tags: f.tags,
        },
      },
      create: {
        id: f.id,
        clientId: trilogyId,
        type: "ARTICLE",
        contentOrUrl: f.body,
        source: "MOCK",
        meta: {
          title: f.title,
          articleType: f.articleType,
          wordCount: f.wordCount,
          tags: f.tags,
        },
      },
    });
  }
  console.log(`  ✓ Upserted ${TRILOGY_FILLER.length} Trilogy filler entries (v2 additive)`);

  // Counts sanity log
  const counts: Record<string, number> = {
    SIMPLE: 0,
    MODERATE: 0,
    RICH: 0,
    EXTRA_RICH: 0,
  };
  for (const c of CLIENTS) counts[c.richnessLevel] += 1;
  console.log("  ✓ Richness distribution:", counts);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
