/**
 * v3 — the NewsForge design language.
 *
 * Distilled from five real Porter One "Client One" inner-spread newsletters
 * (11×17 spread = two facing letter pages). This module is the single source
 * of truth for:
 *   1. PANEL_PALETTE — hex values behind each PanelToken (renderers + IDML).
 *   2. DESIGN_LANGUAGE_PROMPT — the system prompt for the AI layout designer.
 *
 * The web editor mirrors PANEL_PALETTE in apps/web/src/lib/v3.ts. If you
 * change a value here, change it there (Riley: assert parity in tests).
 */
import type { PanelToken, VisualPersonality } from "@newsforge/shared/schemas";

export interface BrandColors {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

/** Fixed complementary palette. Brand tokens resolve at render time. */
export const FIXED_PALETTE: Record<
  Exclude<PanelToken, "primary" | "secondary" | "accent">,
  string
> = {
  sun: "#E7F22F", // vivid yellow-green — birthday card
  navy: "#151B2B", // deep navy — footer/info panels (light text)
  coral: "#E8762C", // warm orange — events, section headers
  sky: "#78C2E6", // light blue — feature bands
  berry: "#D4A4D2", // lavender — spotlight rails
  leaf: "#6FAE6B", // green — campus/outdoors headers
  blush: "#E9A0B4", // soft pink — spotlight panels
  cream: "#FAF3E2", // warm off-white — executive director corner
  paper: "#FFFFFF",
};

export function resolveToken(token: PanelToken, brand: BrandColors): string {
  switch (token) {
    case "primary":
      return brand.primaryColor;
    case "secondary":
      return brand.secondaryColor;
    case "accent":
      return brand.accentColor;
    default:
      return FIXED_PALETTE[token];
  }
}

/** Tokens whose backgrounds need light text. */
export const DARK_TOKENS: ReadonlySet<PanelToken> = new Set([
  "navy",
  "primary",
]);

/** Rotation used for section headers when the designer doesn't specify. */
export const HEADER_ROTATION: PanelToken[] = [
  "coral",
  "sky",
  "leaf",
  "berry",
  "accent",
];

/** Rotation used for side-rail panels. */
export const PANEL_ROTATION: PanelToken[] = [
  "coral",
  "sky",
  "berry",
  "navy",
  "blush",
  "leaf",
];

export interface PersonalityStyle {
  headerRotation: PanelToken[];
  panelRotation: PanelToken[];
  defaultCornerRadius: number;
  photoTreatment: "rounded" | "collage" | "stacked" | "wide" | "portrait";
}

export const PERSONALITY_STYLES: Record<VisualPersonality, PersonalityStyle> = {
  "classic-community": {
    headerRotation: HEADER_ROTATION,
    panelRotation: PANEL_ROTATION,
    defaultCornerRadius: 8,
    photoTreatment: "rounded",
  },
  "garden-warmth": {
    headerRotation: ["leaf", "coral", "sky", "accent", "berry"],
    panelRotation: ["cream", "leaf", "sky", "sun", "blush"],
    defaultCornerRadius: 6,
    photoTreatment: "rounded",
  },
  "photo-journal": {
    headerRotation: ["primary", "coral", "accent", "navy", "leaf"],
    panelRotation: ["paper", "cream", "sky", "blush", "leaf"],
    defaultCornerRadius: 2,
    photoTreatment: "wide",
  },
  "resident-spotlight": {
    headerRotation: ["accent", "berry", "primary", "leaf", "coral"],
    panelRotation: ["cream", "berry", "blush", "sky", "paper"],
    defaultCornerRadius: 16,
    photoTreatment: "portrait",
  },
  "editorial-calm": {
    headerRotation: ["primary", "accent", "leaf", "coral", "sky"],
    panelRotation: ["paper", "cream", "sky", "blush", "leaf"],
    defaultCornerRadius: 0,
    photoTreatment: "wide",
  },
  "celebration-pop": {
    headerRotation: ["coral", "sun", "berry", "sky", "leaf"],
    panelRotation: ["sun", "sky", "berry", "coral", "blush", "leaf"],
    defaultCornerRadius: 4,
    photoTreatment: "collage",
  },
};

export function chooseVisualPersonality(input: {
  brandVoice?: string | null;
  clientName?: string | null;
  photoGoal: "text-led" | "balanced" | "photo-led";
  density: "sparse" | "moderate" | "dense";
  compositionGrammar: string;
}): VisualPersonality {
  const voice = `${input.clientName ?? ""} ${input.brandVoice ?? ""}`.toLowerCase();
  if (/celebrat|colorful|vibrant|playful|energetic|festival/.test(voice)) {
    return "celebration-pop";
  }
  if (input.photoGoal === "photo-led" || input.compositionGrammar === "photo-recap-spread") {
    return "photo-journal";
  }
  if (/garden|warm|friendly|community|home/.test(voice)) return "garden-warmth";
  if (
    input.compositionGrammar === "director-note-feature" ||
    input.compositionGrammar === "lead-story-collage"
  ) {
    return "resident-spotlight";
  }
  if (input.density === "dense" || /editorial|calm|refined|classic/.test(voice)) {
    return "editorial-calm";
  }
  return "classic-community";
}

/**
 * System prompt for the AI layout designer. Kept as a named export so the
 * ai-edits audit log records exactly what specification the model received
 * (FR-5 in the v1 requirements doc).
 */
export const DESIGN_LANGUAGE_PROMPT = `You are the layout designer for a senior-living community's monthly print newsletter — the inner spread of an 11x17 fold: two facing letter-size pages. In the final folded newsletter, these are usually pages 2 and 3; page 1 and page 4 are the reusable client wrapper.

You receive: the client brand kit, a template's slot grid (a starting skeleton — you may adjust positions and spans), the month's articles (with excerpts), and the month's photos. You return a complete AssembledLayout blocks array as strict JSON.

PORTERONE REFERENCE TARGET (the originals are the source of truth; the skeleton is only a starting point):
1. The output should feel like it came from the five PorterOne originals, not like a generic template. Choose the best reference family for this issue: Gateway-style community collage, photo rails, dense lavender/editorial grid, editorial rail, or feature-band issue.
2. Use the supplied slot grid as movable geometry. You may adjust block positions and spans when it improves PorterOne resemblance, content hierarchy, photo rhythm, and dense editorial fit.
3. PorterOne pages are dense but organized: many mid-sized modules, purposeful colored panels, compact lists, several real-life photos, and at least one strong rail/band/anchor shape. Avoid giant two-block magazine layouts and avoid oversized colored slabs with little content.
   Numeric target: aim for 14–18 meaningful content modules across the two pages, keep no single content block above roughly 22% of a page (never above 24%), and use 5–11 purposeful image blocks when the supplied photos support it. Prefer three mid-sized modules over one large module.
4. Panels are purposeful, not everywhere. Use "sun" for birthdays, "cream" for Executive Director, "berry" for profile/spotlight rails, "sky" for feature bands, "leaf" or "coral" for callouts/events, and "navy" with invertText for footer/info bars.
5. Set style.panelRole whenever a block fits: birthday, directorCorner, happyHour, upcomingEvents, outingList, spotlightRail, featureBand, volunteerCallout, infoFooter, photoCluster.
6. Colored ALL-CAPS section headers. Every feature article gets a short heading with headerColor drawn from coral/sky/leaf/berry/accent. Vary colors across the spread; never two adjacent features with the same headerColor.
7. Birthdays are a list block. If an article or its excerpt contains birthday names/dates, convert it to kind "list" with listItems: group headers ("RESIDENTS", "STAFF") as isGroupHeader rows, then {label: "First L.", value: "M/D"} rows. Style: bg "sun", panelRole "birthday", scriptHeading, heading "Happy Birthday!".
8. Dated schedules and outings are list blocks too. Happy Hour uses panelRole "happyHour" with blue/coral headerColor. Upcoming Events uses panelRole "upcomingEvents" with berry/coral headerColor. Outings use panelRole "outingList" with compact two-column rows when possible. Dated lists (happyHour, outingList, upcomingEvents) MUST be narrow rails (colSpan <= about 6 on a 24-column grid) or compact two-column lists. Never place a short dated list (six rows or fewer) in a wide single-column band: it cannot fill the width and strands white space.
9. Every photo gets a caption unless it is part of a tight collage/photoCluster. Captions are italic and short. Photos cluster near their stories; prefer several smaller human/community photos over one large generic hero.
10. No white space, no overflow. Every page should have strong edge-to-edge editorial rhythm; if content is sparse, grow photos and compact callouts, not empty panels. If content overflows, prefer trimming the longest article over dropping required content.

STRICT OUTPUT RULES:
- JSON only, matching the provided schema. Preserve every blockId you were given for blocks you keep; new blocks get blockId "new-1", "new-2", ...
- Grid is {columns} columns x {rows} rows per page; col + colSpan - 1 must not exceed {columns}.
- Only reference provided articleId / imageId values. Every provided image must appear exactly once.
- Do not invent facts. Headings and captions must derive from the provided content.`;
