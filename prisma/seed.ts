/**
 * NewsForge seed — 25 invented senior-center clients + 10 structurally distinct templates.
 * Idempotent (Prisma upsert keyed on stable CUIDs from packages/shared).
 * Vitaly §6.9: re-runnable safely on every deploy via `release` command.
 *
 * NOTHING REAL HERE:
 * - All community names are invented.
 * - All logos are pure SVG glyphs (no real branding).
 * - No resident photos. Image refs in seed are abstract data: SVG patterns only.
 * - All cities are real (small/medium US towns) but no real community is referenced.
 */
import { PrismaClient } from "@prisma/client";
import {
  STABLE_CLIENT_IDS,
  STABLE_TEMPLATE_IDS,
  type StableClientId,
  type StableTemplateId,
} from "../packages/shared/src/dtos/index.js";

const prisma = new PrismaClient();

// ───────────────────────────────────────────────────────────────────────────────
// Templates — 10 structurally distinct layouts. Each has a unique grid + slot mix.
// ───────────────────────────────────────────────────────────────────────────────

type SlotSpec = {
  id: string;
  page: number;
  type:
    | "masthead"
    | "headline"
    | "image"
    | "body"
    | "sidebar"
    | "gallery"
    | "footer";
  x: number;
  y: number;
  wMin: number;
  wMax: number;
  hMin: number;
  hMax: number;
};

interface TemplateSpec {
  id: StableTemplateId;
  name: string;
  pageCount: number;
  gridSpec: { columns: number; rowsPerPage: number; gutter: number; margin: number };
  slotTypes: SlotSpec[];
  compatibilityHints: { richnessRange: string[]; minArticles: number; minImages: number };
}

const TEMPLATES: TemplateSpec[] = [
  // 1. Heritage Quarterly — classic 2-col editorial, 8 pages
  {
    id: "tmpl_heritage_quarterly",
    name: "Heritage Quarterly",
    pageCount: 8,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 16, margin: 36 },
    slotTypes: pageSequence(8, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 3, 3),
          slot("h", page, "headline", 0, 3, 8, 8, 4, 4),
          slot("img", page, "image", 8, 3, 4, 4, 4, 4),
          slot("b", page, "body", 0, 7, 12, 12, 8, 8),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 12, 12, 2, 2),
        slot("b1", page, "body", 0, 2, 6, 6, 10, 10),
        slot("b2", page, "body", 6, 2, 6, 6, 10, 10),
        slot("img", page, "image", 0, 12, 8, 8, 3, 3),
        slot("sd", page, "sidebar", 8, 12, 4, 4, 3, 3),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["MODERATE", "RICH", "EXTRA_RICH"], minArticles: 4, minImages: 3 },
  },
  // 2. Garden Gazette — image-heavy 6 pages
  {
    id: "tmpl_garden_gazette",
    name: "Garden Gazette",
    pageCount: 6,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 16, margin: 32 },
    slotTypes: pageSequence(6, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 2, 2),
          slot("img", page, "image", 0, 2, 12, 12, 7, 7),
          slot("h", page, "headline", 0, 9, 12, 12, 3, 3),
          slot("b", page, "body", 0, 12, 12, 12, 3, 3),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("img1", page, "image", 0, 0, 7, 7, 7, 7),
        slot("hd", page, "headline", 7, 0, 5, 5, 3, 3),
        slot("b", page, "body", 7, 3, 5, 5, 9, 9),
        slot("img2", page, "gallery", 0, 7, 7, 7, 8, 8),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["RICH", "EXTRA_RICH"], minArticles: 3, minImages: 6 },
  },
  // 3. Civic Record — text-heavy, simple richness, 4 pages
  {
    id: "tmpl_civic_record",
    name: "Civic Record",
    pageCount: 4,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 12, margin: 28 },
    slotTypes: pageSequence(4, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 2, 2),
          slot("h", page, "headline", 0, 2, 12, 12, 2, 2),
          slot("b1", page, "body", 0, 4, 6, 6, 11, 11),
          slot("b2", page, "body", 6, 4, 6, 6, 11, 11),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 12, 12, 2, 2),
        slot("b1", page, "body", 0, 2, 4, 4, 13, 13),
        slot("b2", page, "body", 4, 2, 4, 4, 13, 13),
        slot("b3", page, "body", 8, 2, 4, 4, 13, 13),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["SIMPLE", "MODERATE"], minArticles: 3, minImages: 0 },
  },
  // 4. Sunset Chronicle — magazine 8 pages, alternating spreads
  {
    id: "tmpl_sunset_chronicle",
    name: "Sunset Chronicle",
    pageCount: 8,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 16, margin: 36 },
    slotTypes: pageSequence(8, (page) => {
      const isOdd = page % 2 === 1;
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 3, 3),
          slot("img", page, "image", 0, 3, 12, 12, 6, 6),
          slot("h", page, "headline", 0, 9, 12, 12, 2, 2),
          slot("b", page, "body", 0, 11, 12, 12, 4, 4),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      if (isOdd) {
        return [
          slot("hd", page, "headline", 0, 0, 8, 8, 3, 3),
          slot("img", page, "image", 8, 0, 4, 4, 7, 7),
          slot("b", page, "body", 0, 3, 8, 8, 12, 12),
          slot("sd", page, "sidebar", 8, 7, 4, 4, 8, 8),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("img1", page, "image", 0, 0, 6, 6, 10, 10),
        slot("hd", page, "headline", 6, 0, 6, 6, 2, 2),
        slot("b", page, "body", 6, 2, 6, 6, 13, 13),
        slot("img2", page, "image", 0, 10, 6, 6, 5, 5),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["MODERATE", "RICH", "EXTRA_RICH"], minArticles: 5, minImages: 5 },
  },
  // 5. Lakeview Dispatch — 6 pages, sidebar-heavy
  {
    id: "tmpl_lakeview_dispatch",
    name: "Lakeview Dispatch",
    pageCount: 6,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 16, margin: 32 },
    slotTypes: pageSequence(6, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 2, 2),
          slot("h", page, "headline", 0, 2, 8, 8, 3, 3),
          slot("sd", page, "sidebar", 8, 2, 4, 4, 13, 13),
          slot("img", page, "image", 0, 5, 8, 8, 5, 5),
          slot("b", page, "body", 0, 10, 8, 8, 5, 5),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 8, 8, 2, 2),
        slot("b", page, "body", 0, 2, 8, 8, 13, 13),
        slot("sd1", page, "sidebar", 8, 0, 4, 4, 5, 5),
        slot("sd2", page, "sidebar", 8, 5, 4, 4, 5, 5),
        slot("sd3", page, "sidebar", 8, 10, 4, 4, 5, 5),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["MODERATE", "RICH"], minArticles: 4, minImages: 2 },
  },
  // 6. Homestead Herald — 4 pages, single column / accessible
  {
    id: "tmpl_homestead_herald",
    name: "Homestead Herald",
    pageCount: 4,
    gridSpec: { columns: 8, rowsPerPage: 16, gutter: 12, margin: 32 },
    slotTypes: pageSequence(4, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 8, 8, 3, 3),
          slot("h", page, "headline", 0, 3, 8, 8, 3, 3),
          slot("img", page, "image", 0, 6, 8, 8, 5, 5),
          slot("b", page, "body", 0, 11, 8, 8, 4, 4),
          slot("f", page, "footer", 0, 15, 8, 8, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 8, 8, 3, 3),
        slot("b", page, "body", 0, 3, 8, 8, 12, 12),
        slot("f", page, "footer", 0, 15, 8, 8, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["SIMPLE"], minArticles: 2, minImages: 1 },
  },
  // 7. Postcard Press — 6 pages, lots of small galleries
  {
    id: "tmpl_postcard_press",
    name: "Postcard Press",
    pageCount: 6,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 14, margin: 28 },
    slotTypes: pageSequence(6, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 2, 2),
          slot("g", page, "gallery", 0, 2, 12, 12, 5, 5),
          slot("h", page, "headline", 0, 7, 12, 12, 2, 2),
          slot("b", page, "body", 0, 9, 12, 12, 6, 6),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("g1", page, "gallery", 0, 0, 4, 4, 4, 4),
        slot("g2", page, "gallery", 4, 0, 4, 4, 4, 4),
        slot("g3", page, "gallery", 8, 0, 4, 4, 4, 4),
        slot("b", page, "body", 0, 4, 12, 12, 11, 11),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["RICH", "EXTRA_RICH"], minArticles: 3, minImages: 8 },
  },
  // 8. Evergreen Edition — 12 pages, premium spread
  {
    id: "tmpl_evergreen_edition",
    name: "Evergreen Edition",
    pageCount: 12,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 18, margin: 40 },
    slotTypes: pageSequence(12, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 3, 3),
          slot("img", page, "image", 0, 3, 12, 12, 8, 8),
          slot("h", page, "headline", 0, 11, 12, 12, 2, 2),
          slot("b", page, "body", 0, 13, 12, 12, 2, 2),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 12, 12, 2, 2),
        slot("img", page, "image", 0, 2, 7, 7, 6, 6),
        slot("b", page, "body", 7, 2, 5, 5, 13, 13),
        slot("sd", page, "sidebar", 0, 8, 7, 7, 7, 7),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["EXTRA_RICH"], minArticles: 6, minImages: 8 },
  },
  // 9. Bloomfield Broadside — 6 pages, three-column tabloid feel
  {
    id: "tmpl_bloomfield_broadside",
    name: "Bloomfield Broadside",
    pageCount: 6,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 14, margin: 28 },
    slotTypes: pageSequence(6, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 2, 2),
          slot("h", page, "headline", 0, 2, 12, 12, 3, 3),
          slot("img", page, "image", 0, 5, 12, 12, 4, 4),
          slot("b1", page, "body", 0, 9, 4, 4, 6, 6),
          slot("b2", page, "body", 4, 9, 4, 4, 6, 6),
          slot("b3", page, "body", 8, 9, 4, 4, 6, 6),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 12, 12, 2, 2),
        slot("b1", page, "body", 0, 2, 4, 4, 13, 13),
        slot("b2", page, "body", 4, 2, 4, 4, 13, 13),
        slot("b3", page, "body", 8, 2, 4, 4, 13, 13),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["MODERATE", "RICH"], minArticles: 6, minImages: 2 },
  },
  // 10. Compass Courier — 8 pages, civic + photo balance
  {
    id: "tmpl_compass_courier",
    name: "Compass Courier",
    pageCount: 8,
    gridSpec: { columns: 12, rowsPerPage: 16, gutter: 16, margin: 32 },
    slotTypes: pageSequence(8, (page) => {
      if (page === 1) {
        return [
          slot("m", page, "masthead", 0, 0, 12, 12, 2, 2),
          slot("h", page, "headline", 0, 2, 7, 7, 4, 4),
          slot("img", page, "image", 7, 2, 5, 5, 6, 6),
          slot("b", page, "body", 0, 8, 7, 7, 7, 7),
          slot("sd", page, "sidebar", 7, 8, 5, 5, 7, 7),
          slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
        ];
      }
      return [
        slot("hd", page, "headline", 0, 0, 9, 9, 2, 2),
        slot("img", page, "image", 9, 0, 3, 3, 6, 6),
        slot("b", page, "body", 0, 2, 9, 9, 13, 13),
        slot("sd", page, "sidebar", 9, 6, 3, 3, 9, 9),
        slot("f", page, "footer", 0, 15, 12, 12, 1, 1),
      ];
    }),
    compatibilityHints: { richnessRange: ["MODERATE", "RICH", "EXTRA_RICH"], minArticles: 5, minImages: 4 },
  },
];

function slot(
  id: string,
  page: number,
  type: SlotSpec["type"],
  x: number,
  y: number,
  wMin: number,
  wMax: number,
  hMin: number,
  hMax: number,
): SlotSpec {
  return { id: `s_${type}_${page}_${id}`, page, type, x, y, wMin, wMax, hMin, hMax };
}

function pageSequence(pages: number, fn: (page: number) => SlotSpec[]): SlotSpec[] {
  const out: SlotSpec[] = [];
  for (let p = 1; p <= pages; p++) out.push(...fn(p));
  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Clients — 25 invented senior-center clients spanning richness levels.
// ───────────────────────────────────────────────────────────────────────────────

interface ClientSpec {
  id: StableClientId;
  name: string;
  tagline: string;
  city: string;
  careLevel: "INDEPENDENT_LIVING" | "ASSISTED_LIVING" | "MEMORY_CARE" | "MIXED";
  richnessLevel: "SIMPLE" | "MODERATE" | "RICH" | "EXTRA_RICH";
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  defaultTemplateId: StableTemplateId;
  pageCount: number;
  recurringSections: string[];
  brandVoice: string;
}

const CLIENTS: ClientSpec[] = [
  // SIMPLE (4)
  {
    id: "client_willow_creek",
    name: "Willow Creek Senior Living",
    tagline: "A quiet community by the creek",
    city: "Asheville, NC",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "SIMPLE",
    primaryColor: "#3F5D2E",
    secondaryColor: "#E8E2D1",
    accentColor: "#C97B36",
    headingFont: "Lora",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_homestead_herald",
    pageCount: 4,
    recurringSections: ["Director's Letter", "This Month's Events", "Birthdays"],
    brandVoice: "Plainspoken, warm, neighborly — like a porch conversation. Lean on understatement.",
  },
  {
    id: "client_briar_glen",
    name: "Briar Glen Manor",
    tagline: "Together, at our pace",
    city: "Toledo, OH",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "SIMPLE",
    primaryColor: "#2F4858",
    secondaryColor: "#EFE7DA",
    accentColor: "#B05841",
    headingFont: "Lora",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_civic_record",
    pageCount: 4,
    recurringSections: ["Director's Letter", "Birthdays", "Menu Highlights"],
    brandVoice: "Steady, kind, a touch formal. Short sentences and gentle reassurance.",
  },
  {
    id: "client_chestnut_hill",
    name: "Chestnut Hill Residences",
    tagline: "Plain truth, plain comfort",
    city: "Burlington, VT",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "SIMPLE",
    primaryColor: "#5A3A2E",
    secondaryColor: "#F0E5D2",
    accentColor: "#7E9A6B",
    headingFont: "Merriweather",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_homestead_herald",
    pageCount: 4,
    recurringSections: ["Director's Letter", "This Month's Events"],
    brandVoice: "Modest and Yankee-direct. No flourish. Trust the reader.",
  },
  {
    id: "client_quail_run",
    name: "Quail Run Estates",
    tagline: "Quiet days, neighborly nights",
    city: "Spokane, WA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "SIMPLE",
    primaryColor: "#5F4B32",
    secondaryColor: "#EFE3CD",
    accentColor: "#937A4A",
    headingFont: "Merriweather",
    bodyFont: "Nunito",
    defaultTemplateId: "tmpl_civic_record",
    pageCount: 4,
    recurringSections: ["Director's Letter", "Birthdays", "This Month's Events"],
    brandVoice: "Friendly and pragmatic. Acknowledges weather; mentions the dog at the front desk.",
  },

  // MODERATE (8)
  {
    id: "client_maple_ridge",
    name: "Maple Ridge Community",
    tagline: "Where stories take root",
    city: "Madison, WI",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#1F4D8C",
    secondaryColor: "#C8B47A",
    accentColor: "#E26A2C",
    headingFont: "Fraunces",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_lakeview_dispatch",
    pageCount: 6,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "This Month's Events",
      "Menu Highlights",
      "Photo Gallery",
    ],
    brandVoice: "Warm and lightly literary. Long enough to settle in; short enough to finish over coffee.",
  },
  {
    id: "client_juniper_hollow",
    name: "Juniper Hollow",
    tagline: "Pines, porches, and people",
    city: "Boulder, CO",
    careLevel: "MIXED",
    richnessLevel: "MODERATE",
    primaryColor: "#3A5A40",
    secondaryColor: "#DAD7CD",
    accentColor: "#A98B2F",
    headingFont: "Fraunces",
    bodyFont: "Nunito",
    defaultTemplateId: "tmpl_compass_courier",
    pageCount: 8,
    recurringSections: ["Director's Letter", "Events", "Wellness Notes", "Menu Highlights"],
    brandVoice: "Outdoorsy, calm, observational. Mentions weather honestly.",
  },
  {
    id: "client_cedar_pointe",
    name: "Cedar Pointe Village",
    tagline: "Steady, warm, ours",
    city: "Cedar Rapids, IA",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#2C3E50",
    secondaryColor: "#E1D5C0",
    accentColor: "#C0392B",
    headingFont: "Lora",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_lakeview_dispatch",
    pageCount: 6,
    recurringSections: ["Director's Letter", "Events", "Birthdays", "Menu Highlights"],
    brandVoice: "Midwestern matter-of-fact with a soft edge. Pride in the everyday.",
  },
  {
    id: "client_hawthorne_court",
    name: "Hawthorne Court",
    tagline: "A small house, a long welcome",
    city: "Portland, ME",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#6B2D5C",
    secondaryColor: "#E8DEEA",
    accentColor: "#F2A65A",
    headingFont: "Cormorant Garamond",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_bloomfield_broadside",
    pageCount: 6,
    recurringSections: ["Director's Letter", "Resident Spotlight", "Events", "Menu Highlights"],
    brandVoice: "Wry, gentle, a little coastal. Lean into the smallness of the community.",
  },
  {
    id: "client_orchard_view",
    name: "Orchard View",
    tagline: "Seasons told slowly",
    city: "Walla Walla, WA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#7B4B22",
    secondaryColor: "#EFE2C8",
    accentColor: "#3A6B35",
    headingFont: "Lora",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_compass_courier",
    pageCount: 8,
    recurringSections: ["Director's Letter", "Events", "Garden Notes", "Menu Highlights"],
    brandVoice: "Earthy and unhurried. Names the trees; honors the harvest.",
  },
  {
    id: "client_brookside_manor",
    name: "Brookside Manor",
    tagline: "Where afternoons unspool",
    city: "Lexington, KY",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#264653",
    secondaryColor: "#E9D8A6",
    accentColor: "#E76F51",
    headingFont: "Fraunces",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_lakeview_dispatch",
    pageCount: 6,
    recurringSections: ["Director's Letter", "Resident Spotlight", "Events", "Menu Highlights"],
    brandVoice: "Hospitable Southern cadence. Patient, generous, occasionally funny.",
  },
  {
    id: "client_summit_house",
    name: "Summit House",
    tagline: "Higher ground, friendlier neighbors",
    city: "Flagstaff, AZ",
    careLevel: "MIXED",
    richnessLevel: "MODERATE",
    primaryColor: "#1B4965",
    secondaryColor: "#CAE9FF",
    accentColor: "#F4A261",
    headingFont: "Merriweather",
    bodyFont: "Nunito",
    defaultTemplateId: "tmpl_compass_courier",
    pageCount: 8,
    recurringSections: ["Director's Letter", "Events", "Wellness Notes", "Menu Highlights"],
    brandVoice: "Open-skied, plain, practical. Acknowledges altitude and the long view.",
  },
  {
    id: "client_birchwood_gardens",
    name: "Birchwood Gardens",
    tagline: "A leaf at a time",
    city: "Ann Arbor, MI",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "MODERATE",
    primaryColor: "#386641",
    secondaryColor: "#F2E8CF",
    accentColor: "#BC4749",
    headingFont: "Lora",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_lakeview_dispatch",
    pageCount: 6,
    recurringSections: ["Director's Letter", "Events", "Menu Highlights", "Birthdays"],
    brandVoice: "Bookish, quietly proud of the library cart. Treats the reader as a peer.",
  },

  // RICH (8)
  {
    id: "client_sunset_bay",
    name: "Sunset Bay Coastal Living",
    tagline: "The long, golden hour",
    city: "Newport Beach, CA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#9A3324",
    secondaryColor: "#F4D6B0",
    accentColor: "#244B66",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_sunset_chronicle",
    pageCount: 8,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Menu Highlights",
      "Photo Gallery",
      "Wellness Notes",
    ],
    brandVoice: "Elegant, coastal, lightly literary. A magazine voice without pretension.",
  },
  {
    id: "client_lakeview_terrace",
    name: "Lakeview Terrace",
    tagline: "Wide water, deep welcome",
    city: "Traverse City, MI",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#1D3557",
    secondaryColor: "#A8DADC",
    accentColor: "#E63946",
    headingFont: "Fraunces",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_garden_gazette",
    pageCount: 6,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Menu Highlights",
      "Photo Gallery",
    ],
    brandVoice: "Lake-cottage warmth. A slight smile in every sentence; never twee.",
  },
  {
    id: "client_aspen_grove",
    name: "Aspen Grove",
    tagline: "A grove of good company",
    city: "Park City, UT",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#0B6E4F",
    secondaryColor: "#E9E2C9",
    accentColor: "#D9A441",
    headingFont: "Cormorant Garamond",
    bodyFont: "Nunito",
    defaultTemplateId: "tmpl_sunset_chronicle",
    pageCount: 8,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Wellness Notes",
      "Menu Highlights",
    ],
    brandVoice: "Crisp, mountain-bright, generous. A subtle aspiration without snobbery.",
  },
  {
    id: "client_silver_lake",
    name: "Silver Lake Residences",
    tagline: "Days that shine",
    city: "Madison, WI",
    careLevel: "MIXED",
    richnessLevel: "RICH",
    primaryColor: "#3D5A80",
    secondaryColor: "#E0FBFC",
    accentColor: "#EE6C4D",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_lakeview_dispatch",
    pageCount: 6,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Menu Highlights",
      "Photo Gallery",
    ],
    brandVoice: "Lake-town optimism. Names the road, the pier, the bakery.",
  },
  {
    id: "client_pinecrest_village",
    name: "Pinecrest Village",
    tagline: "Tall pines, taller stories",
    city: "Asheville, NC",
    careLevel: "MIXED",
    richnessLevel: "RICH",
    primaryColor: "#2D6A4F",
    secondaryColor: "#D8F3DC",
    accentColor: "#B7094C",
    headingFont: "Fraunces",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_postcard_press",
    pageCount: 6,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Photo Gallery",
      "Menu Highlights",
    ],
    brandVoice: "Mountain-bright, talkative, neighborly. Likes a good anecdote.",
  },
  {
    id: "client_magnolia_park",
    name: "Magnolia Park",
    tagline: "Slow bloom, deep root",
    city: "Charleston, SC",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#5C2E2E",
    secondaryColor: "#F1D1B5",
    accentColor: "#94795D",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_sunset_chronicle",
    pageCount: 8,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Garden Notes",
      "Menu Highlights",
      "Photo Gallery",
    ],
    brandVoice: "Lowcountry cadence — generous, courteous, slow. A house with a long porch.",
  },
  {
    id: "client_riverstone_commons",
    name: "Riverstone Commons",
    tagline: "Where the river bends, we gather",
    city: "Bend, OR",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#264653",
    secondaryColor: "#E9D8A6",
    accentColor: "#2A9D8F",
    headingFont: "Fraunces",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_garden_gazette",
    pageCount: 6,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Menu Highlights",
      "Photo Gallery",
    ],
    brandVoice: "Outdoorsy and quietly proud. References river, trail, sky.",
  },
  {
    id: "client_meadowbrook_estates",
    name: "Meadowbrook Estates",
    tagline: "Open fields, open arms",
    city: "Lancaster, PA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "RICH",
    primaryColor: "#6A994E",
    secondaryColor: "#F2E8CF",
    accentColor: "#BC4749",
    headingFont: "Lora",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_bloomfield_broadside",
    pageCount: 6,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Garden Notes",
      "Menu Highlights",
    ],
    brandVoice: "Rural-rooted, warm, ceremonial about meals. Honors the calendar.",
  },

  // EXTRA_RICH (5)
  {
    id: "client_blue_heron_landing",
    name: "Blue Heron Landing",
    tagline: "Where every hour has a view",
    city: "Sausalito, CA",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#22577A",
    secondaryColor: "#80ED99",
    accentColor: "#C77DFF",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_evergreen_edition",
    pageCount: 12,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Wellness Notes",
      "Menu Highlights",
      "Photo Gallery",
      "Arts & Culture",
      "Op-ed / Community Voice",
    ],
    brandVoice: "Coastal-modern, literate, generous. A premium magazine that still calls the reader friend.",
  },
  {
    id: "client_evergreen_pointe",
    name: "Evergreen Pointe",
    tagline: "Always green, always near",
    city: "Bellingham, WA",
    careLevel: "MIXED",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#1B4332",
    secondaryColor: "#D8E8D2",
    accentColor: "#E07A5F",
    headingFont: "Cormorant Garamond",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_evergreen_edition",
    pageCount: 12,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Wellness Notes",
      "Menu Highlights",
      "Photo Gallery",
      "Arts & Culture",
      "Garden Notes",
    ],
    brandVoice: "Pacific-Northwest quiet sophistication. Long forms welcome; restraint preferred.",
  },
  {
    id: "client_starling_cove",
    name: "Starling Cove",
    tagline: "Small flock, big sky",
    city: "Savannah, GA",
    careLevel: "ASSISTED_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#5A189A",
    secondaryColor: "#E0AAFF",
    accentColor: "#F2A65A",
    headingFont: "Playfair Display",
    bodyFont: "Nunito",
    defaultTemplateId: "tmpl_sunset_chronicle",
    pageCount: 8,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Wellness Notes",
      "Menu Highlights",
      "Photo Gallery",
      "Arts & Culture",
    ],
    brandVoice: "Velvety Southern Gothic — warmth and humor at the porch level, never the parlor.",
  },
  {
    id: "client_harborlight_residences",
    name: "Harborlight Residences",
    tagline: "Steady light, steady hands",
    city: "Portsmouth, NH",
    careLevel: "MIXED",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#003049",
    secondaryColor: "#F4E0C5",
    accentColor: "#D62828",
    headingFont: "Fraunces",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_evergreen_edition",
    pageCount: 12,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Wellness Notes",
      "Menu Highlights",
      "Photo Gallery",
      "Op-ed / Community Voice",
    ],
    brandVoice: "Maritime, careful, generous. Acknowledges the dark months; honors the light.",
  },
  {
    id: "client_palm_meadows",
    name: "Palm Meadows",
    tagline: "Long shadows, longer afternoons",
    city: "Sarasota, FL",
    careLevel: "INDEPENDENT_LIVING",
    richnessLevel: "EXTRA_RICH",
    primaryColor: "#0F4C5C",
    secondaryColor: "#FFE8B6",
    accentColor: "#E36414",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    defaultTemplateId: "tmpl_sunset_chronicle",
    pageCount: 8,
    recurringSections: [
      "Director's Letter",
      "Resident Spotlight",
      "Events",
      "Wellness Notes",
      "Menu Highlights",
      "Photo Gallery",
      "Arts & Culture",
    ],
    brandVoice: "Sun-warm, hospitable, lightly cinematic. Treats time as the day's main character.",
  },
];

// Sanity check — must be 25
if (CLIENTS.length !== STABLE_CLIENT_IDS.length) {
  throw new Error(`Seed mismatch: ${CLIENTS.length} clients vs ${STABLE_CLIENT_IDS.length} ids`);
}

// ───────────────────────────────────────────────────────────────────────────────
// Logo generator — pure SVG glyphs (no real branding).
// ───────────────────────────────────────────────────────────────────────────────

function logoUrl(c: ClientSpec): string {
  // Initials from the first word of the name.
  const initials = c.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="116" fill="${c.primaryColor}"/><circle cx="120" cy="120" r="98" fill="none" stroke="${c.accentColor}" stroke-width="4"/><text x="120" y="148" font-family="Georgia,serif" font-size="100" font-weight="700" text-anchor="middle" fill="${c.secondaryColor}">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ───────────────────────────────────────────────────────────────────────────────
// Global filler pool (no clientId — evergreen content for Gemini fallback).
// ───────────────────────────────────────────────────────────────────────────────

const GLOBAL_FILLER: Array<{ id: string; content: string }> = [
  { id: "filler_welcome", content: "Welcome to another month at the community. We're glad you're reading along." },
  { id: "filler_seasons", content: "The seasons turn, the porches fill, and the kettle stays on." },
  { id: "filler_gratitude", content: "A small note of gratitude — for the staff, the families, the everyday kindnesses that don't make the newsletter but make the place." },
  { id: "filler_invite", content: "Stop by the front desk if you'd like to share a story, a recipe, or a recommendation. We're listening." },
  { id: "filler_garden", content: "The garden is, as always, doing its quiet work." },
  { id: "filler_music", content: "Music drifts down the hallway most afternoons — sometimes a piano, sometimes a record, sometimes a resident humming." },
  { id: "filler_walks", content: "Walking club continues Tuesdays and Thursdays. Pace is conversational; the company is the point." },
  { id: "filler_kitchen", content: "From the kitchen, a small reminder: please flag dietary needs by Sunday for the week ahead." },
];

// ───────────────────────────────────────────────────────────────────────────────
// Main.
// ───────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[seed] Templates …");
  for (const t of TEMPLATES) {
    await prisma.template.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        pageCount: t.pageCount,
        gridSpec: t.gridSpec,
        slotTypes: t.slotTypes,
        compatibilityHints: t.compatibilityHints,
        previewImageUrl: null,
      },
      create: {
        id: t.id,
        name: t.name,
        pageCount: t.pageCount,
        gridSpec: t.gridSpec,
        slotTypes: t.slotTypes,
        compatibilityHints: t.compatibilityHints,
        previewImageUrl: null,
      },
    });
  }
  console.log(`[seed] ${TEMPLATES.length} templates ok`);

  console.log("[seed] Clients …");
  for (const c of CLIENTS) {
    const url = logoUrl(c);
    await prisma.client.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        tagline: c.tagline,
        city: c.city,
        careLevel: c.careLevel,
        richnessLevel: c.richnessLevel,
        logoUrl: url,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor,
        accentColor: c.accentColor,
        headingFont: c.headingFont,
        bodyFont: c.bodyFont,
        defaultTemplateId: c.defaultTemplateId,
        pageCount: c.pageCount,
        recurringSections: c.recurringSections,
        brandVoice: c.brandVoice,
      },
      create: {
        id: c.id,
        name: c.name,
        tagline: c.tagline,
        city: c.city,
        careLevel: c.careLevel,
        richnessLevel: c.richnessLevel,
        logoUrl: url,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor,
        accentColor: c.accentColor,
        headingFont: c.headingFont,
        bodyFont: c.bodyFont,
        defaultTemplateId: c.defaultTemplateId,
        pageCount: c.pageCount,
        recurringSections: c.recurringSections,
        brandVoice: c.brandVoice,
      },
    });
  }
  console.log(`[seed] ${CLIENTS.length} clients ok`);

  console.log("[seed] Global filler pool …");
  for (const f of GLOBAL_FILLER) {
    await prisma.assetLibrary.upsert({
      where: { id: f.id },
      update: {
        contentOrUrl: f.content,
        meta: { title: "Evergreen filler", wordCount: f.content.split(/\s+/).length },
      },
      create: {
        id: f.id,
        clientId: null,
        type: "ARTICLE",
        source: "MOCK",
        contentOrUrl: f.content,
        meta: { title: "Evergreen filler", wordCount: f.content.split(/\s+/).length },
      },
    });
  }
  console.log(`[seed] ${GLOBAL_FILLER.length} filler assets ok`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("[seed] done");
  })
  .catch(async (e) => {
    console.error("[seed] failed", e);
    await prisma.$disconnect();
    process.exit(1);
  });
