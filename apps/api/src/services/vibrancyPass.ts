/**
 * v3 — deterministic vibrancy pass.
 *
 * Runs AFTER layout assembly (deterministic fitter or AI designer) and
 * guarantees the house design language holds even when Gemini is down,
 * misconfigured, or returns a sparse design:
 *
 *   - slots tagged panel:<token> get that panel background
 *   - birthday-ish list/calendar/sidebar blocks get the sun panel + script
 *     heading; schedule-ish blocks get rotating navy/coral panels
 *   - feature article blocks get rotating colored section headers
 *   - every image block gets a caption (from image caption/alt fallback)
 *   - dark panels get invertText
 *
 * Pure function, no I/O, unit-testable (Riley: golden tests per template).
 */
import type {
  Article,
  AssembledLayout,
  LayoutBlock,
  ListItem,
  NewsImage,
  PanelToken,
} from "@newsforge/shared/schemas";
import {
  DARK_TOKENS,
  HEADER_ROTATION,
  PANEL_ROTATION,
} from "./designLanguage.js";

const BIRTHDAY_RE = /birthday/i;
const SCHEDULE_RE = /happy hour|event|calendar|schedule|brunch|save the date/i;
const DATE_LINE_RE = /^\s*(\d{1,2}\/\d{1,2})\s*[:\-–—]?\s*(.+)$/;
const NAME_DATE_RE = /^\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.]*\.?)?)\s+(\d{1,2}\/\d{1,2})\s*$/;

function panelFromStyleTag(tag: string | undefined): PanelToken | null {
  const m = tag?.match(/^panel:([a-z]+)$/);
  if (!m) return null;
  const token = m[1] as PanelToken;
  const known: PanelToken[] = [
    "primary", "secondary", "accent", "sun", "navy", "coral",
    "sky", "berry", "leaf", "blush", "cream", "paper",
  ];
  return known.includes(token) ? token : null;
}

/** Parse "Name 7/12" and "7/12 Event" lines out of an article body. */
export function parseListItems(body: string): ListItem[] {
  const items: ListItem[] = [];
  for (const raw of body.split(/\n|(?<=\.)\s{2,}/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(residents|staff|upcoming|events)[:!]?$/i.test(line)) {
      items.push({ label: line.toUpperCase().replace(/[:!]$/, ""), isGroupHeader: true });
      continue;
    }
    const nd = line.match(NAME_DATE_RE);
    if (nd) {
      items.push({ label: nd[1], value: nd[2] });
      continue;
    }
    const dl = line.match(DATE_LINE_RE);
    if (dl && dl[2].length <= 60) {
      items.push({ label: dl[1], value: dl[2] });
    }
  }
  return items;
}

function firstSentence(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const stop = clean.search(/[.!?]/);
  const s = stop > 0 ? clean.slice(0, stop + 1) : clean;
  return s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export interface VibrancyInput {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
}

export function applyVibrancyPass(input: VibrancyInput): AssembledLayout {
  const articleById = new Map(input.articles.map((a) => [a.id, a]));
  const imageById = new Map(input.images.map((i) => [i.id, i]));
  let headerIdx = 0;
  let panelIdx = 0;

  const blocks: LayoutBlock[] = input.layout.blocks.map((block) => {
    const next: LayoutBlock = { ...block, style: { ...(block.style ?? {}) } };
    const article = next.articleId ? articleById.get(next.articleId) : undefined;
    const tagPanel = panelFromStyleTag(next.styleTag);
    if (tagPanel && !next.style!.bg) next.style!.bg = tagPanel;

    const looksBirthday =
      BIRTHDAY_RE.test(article?.title ?? "") || /birthday/i.test(next.styleTag ?? "");
    const looksSchedule =
      SCHEDULE_RE.test(article?.title ?? "") || /schedule|events/i.test(next.styleTag ?? "");

    // --- Structured list conversion (birthdays / schedules) ---
    if (
      article &&
      next.kind !== "image" &&
      (looksBirthday || looksSchedule)
    ) {
      const items = next.listItems?.length
        ? next.listItems
        : parseListItems(article.body);
      if (items.length >= 2) {
        next.kind = "list";
        next.listItems = items;
        next.heading = next.heading ?? article.title;
        if (looksBirthday) {
          next.style!.bg = next.style!.bg ?? "sun";
          next.style!.scriptHeading = next.style!.scriptHeading ?? true;
        } else {
          next.style!.bg =
            next.style!.bg ?? PANEL_ROTATION[panelIdx++ % PANEL_ROTATION.length];
          next.style!.centered = next.style!.centered ?? true;
        }
      }
    }

    // --- Sidebar/calendar panels always get a panel color ---
    if (
      (next.kind === "recurring" || next.kind === "filler") &&
      /sidebar|calendar/.test(next.styleTag ?? "") &&
      !next.style!.bg
    ) {
      next.style!.bg = PANEL_ROTATION[panelIdx++ % PANEL_ROTATION.length];
    }
    if (/exec|director|letter|corner/i.test(next.styleTag ?? "") || /director/i.test(article?.title ?? "")) {
      next.style!.bg = next.style!.bg ?? "cream";
      next.style!.scriptHeading = next.style!.scriptHeading ?? true;
      next.heading = next.heading ?? "Executive Director Corner";
    }

    // --- Feature headers get rotating colors ---
    if (
      (next.kind === "article" || next.kind === "recurring") &&
      article &&
      !next.style!.headerColor
    ) {
      next.style!.headerColor =
        HEADER_ROTATION[headerIdx++ % HEADER_ROTATION.length];
      next.heading = next.heading ?? article.title;
    }

    // --- Every image gets a caption ---
    if (next.kind === "image" && next.imageId) {
      const img = imageById.get(next.imageId);
      if (!next.caption) {
        next.caption =
          img?.caption ??
          (img?.alt ? firstSentence(img.alt) : undefined) ??
          "A wonderful moment around campus!";
      }
    }

    // --- Dark panels invert text ---
    if (next.style!.bg && DARK_TOKENS.has(next.style!.bg)) {
      next.style!.invertText = next.style!.invertText ?? true;
    }

    // Drop empty style objects to keep stored JSON tidy.
    if (next.style && Object.keys(next.style).length === 0) delete next.style;
    return next;
  });

  return { ...input.layout, blocks };
}
