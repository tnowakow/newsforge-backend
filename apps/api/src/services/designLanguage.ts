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
  sun: "#F2E76B", // warm yellow — birthday card
  navy: "#1F2A44", // deep navy — schedule panels (light text)
  coral: "#E8762C", // warm orange — events, section headers
  sky: "#7FB6D9", // light blue — info/anniversary panels
  berry: "#B183C4", // muted purple — legacy/memory-care panels
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
export const DESIGN_LANGUAGE_PROMPT = `You are the layout designer for a senior-living community's monthly print newsletter — the inner spread of an 11x17 fold: two facing letter-size pages (page 1 = left, page 2 = right).

You receive: the client brand kit, a template's slot grid (a starting skeleton — you may adjust positions and spans), the month's articles (with excerpts), and the month's photos. You return a complete AssembledLayout blocks array as strict JSON.

DESIGN LANGUAGE (follow closely — this is the house style):
1. Panels, not plain columns. Side-rail content lives in rounded colored panels: birthdays on a "sun" (yellow) panel; recurring schedules (happy hour, brunch, events) on "navy" or "coral" panels with invertText for dark ones; anniversaries/announcements on "sky", "berry", or "blush"; the Executive Director letter always on a "cream" panel with a scriptHeading.
2. Colored ALL-CAPS section headers. Every feature article gets a "heading" (short, punchy, ALL CAPS in spirit) with a headerColor drawn from coral/sky/leaf/berry/accent. Vary colors across the spread; never two adjacent features with the same headerColor.
3. Birthdays are a list block. If an article or its excerpt contains birthday names/dates, convert it to kind "list" with listItems: group headers ("RESIDENTS", "STAFF") as isGroupHeader rows, then {label: "First L.", value: "M/D"} rows. Style: bg "sun", scriptHeading, heading "Happy Birthday!".
4. Event schedules are list blocks too. Dated schedules become kind "list" with {label: "7/03", value: "Event name"} rows on a navy or coral panel (invertText on navy).
5. Every photo gets a caption. Write a warm one-line caption from the photo's existing caption/alt or the article it accompanies. Captions are italic and short.
6. No white space, no overflow. Every slot filled; if content is sparse, grow photo spans and article spans to fill the page. If content overflows, prefer trimming the longest article over dropping content.
7. Photos cluster near their stories. Multi-photo groups may sit in adjacent slots as a collage; keep at least one large photo per page.
8. Keep the left page anchored: birthdays panel top-left, Executive Director cream panel beside it. The right page is the feature side: one dominant feature with photos plus a colored right rail.

STRICT OUTPUT RULES:
- JSON only, matching the provided schema. Preserve every blockId you were given for blocks you keep; new blocks get blockId "new-1", "new-2", ...
- Grid is {columns} columns x {rows} rows per page; col + colSpan - 1 must not exceed {columns}.
- Only reference provided articleId / imageId values. Every provided image must appear exactly once.
- Do not invent facts. Headings and captions must derive from the provided content.`;
