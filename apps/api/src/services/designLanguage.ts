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
import type { PanelToken } from "@newsforge/shared/schemas";

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

/**
 * System prompt for the AI layout designer. Kept as a named export so the
 * ai-edits audit log records exactly what specification the model received
 * (FR-5 in the v1 requirements doc).
 */
export const DESIGN_LANGUAGE_PROMPT = `You are the layout designer for a senior-living community's monthly print newsletter — the inner spread of an 11x17 fold: two facing letter-size pages. In the final folded newsletter, these are usually pages 2 and 3; page 1 and page 4 are the reusable client wrapper.

You receive: the client brand kit, a template's slot grid (a starting skeleton — you may adjust positions and spans), the month's articles (with excerpts), and the month's photos. You return a complete AssembledLayout blocks array as strict JSON.

GATEWAY SPRINGS REFERENCE TARGET (follow closely for demo-quality output):
1. Page 1 of this inner spread should feel like Gateway page 2: a vivid birthday card at top-left, a cream Executive Director Corner across the top, then HAPPY HOUR and UPCOMING EVENTS as two dense lower editorial columns with blue/purple all-caps headers and small photo clusters along the bottom.
2. Page 2 of this inner spread should feel like Gateway page 3: stacked photos on the left, OUT AND ABOUT as a centered outing list near the top, a tall lavender Smile-of-the-Month style right rail, a sky-blue feature band across the middle, a green volunteer callout, and a dark navy Trust Funds / info footer spanning the bottom.
3. Panels are purposeful, not everywhere. Use "sun" for birthdays, "cream" for Executive Director, "berry" for the tall profile rail, "sky" for feature bands, "navy" with invertText for footer/info bars, and mostly plain paper for Happy Hour / Upcoming Events text columns.
4. Set style.panelRole whenever a block fits: birthday, directorCorner, happyHour, upcomingEvents, outingList, spotlightRail, featureBand, volunteerCallout, infoFooter, photoCluster.
5. Colored ALL-CAPS section headers. Every feature article gets a short heading with headerColor drawn from coral/sky/leaf/berry/accent. Vary colors across the spread; never two adjacent features with the same headerColor.
6. Birthdays are a list block. If an article or its excerpt contains birthday names/dates, convert it to kind "list" with listItems: group headers ("RESIDENTS", "STAFF") as isGroupHeader rows, then {label: "First L.", value: "M/D"} rows. Style: bg "sun", panelRole "birthday", scriptHeading, heading "Happy Birthday!".
7. Dated schedules and outings are list blocks too. Happy Hour uses panelRole "happyHour" on paper with blue headerColor. Upcoming Events uses panelRole "upcomingEvents" on paper with berry headerColor. Outings use panelRole "outingList" with compact two-column rows when possible.
8. Every photo gets a caption unless it is part of a tight collage/photoCluster. Captions are italic and short.
9. No white space, no overflow. Every slot filled; if content is sparse, grow photo spans and article spans to fill the page. If content overflows, prefer trimming the longest article over dropping content.
10. Photos cluster near their stories. Multi-photo groups may sit in adjacent slots as a collage; keep several small real-life photos across pages 1 and 2.

STRICT OUTPUT RULES:
- JSON only, matching the provided schema. Preserve every blockId you were given for blocks you keep; new blocks get blockId "new-1", "new-2", ...
- Grid is {columns} columns x {rows} rows per page; col + colSpan - 1 must not exceed {columns}.
- Only reference provided articleId / imageId values. Every provided image must appear exactly once.
- Do not invent facts. Headings and captions must derive from the provided content.`;
