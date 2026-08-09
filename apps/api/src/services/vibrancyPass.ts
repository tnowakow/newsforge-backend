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
  PanelRole,
  PanelToken,
  VisualPersonality,
} from "@newsforge/shared/schemas";
import {
  DARK_TOKENS,
  HEADER_ROTATION,
  PANEL_ROTATION,
  PERSONALITY_STYLES,
} from "./designLanguage.js";

const BIRTHDAY_RE = /birthday/i;
const SCHEDULE_RE = /happy hour|event|calendar|schedule|brunch|save the date/i;
const OUTING_RE = /out and about|outing|destination|trip/i;
const SPOTLIGHT_RE = /smile of the month|spotlight|meet\s+/i;
const FEATURE_BAND_RE = /scrubbly|car wash|recap|feature band/i;
const VOLUNTEER_RE = /make the difference|volunteer/i;
const INFO_FOOTER_RE = /trust funds|business office|compliance|hotline/i;
const DATE_LINE_RE = /^\s*(\d{1,2}\/\d{1,2})\s*[:\-–—]?\s*(.+)$/;
const NAME_DATE_RE = /^\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.]*\.?)?)\s+(\d{1,2}\/\d{1,2})\s*$/;
const INLINE_NAME_DATE_RE = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+[A-Z]\.)\s+(?:on\s+)?(\d{1,2}\/\d{1,2})/g;

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
  if (items.length === 0) {
    for (const match of body.matchAll(INLINE_NAME_DATE_RE)) {
      items.push({ label: match[1], value: match[2] });
    }
  }
  return items;
}

function compactBirthdayItems(items: ListItem[], block: LayoutBlock): ListItem[] {
  const area = block.position.colSpan * block.position.rowSpan;
  if (area > 32 || items.length <= 12) return items;

  const compact: ListItem[] = [];
  let rows = 0;
  let activeGroup = "";
  const maxRowsByGroup: Record<string, number> = { RESIDENTS: 4, STAFF: 4 };
  for (const item of items) {
    if (item.isGroupHeader) {
      activeGroup = item.label.toUpperCase();
      if (!compact.some((existing) => existing.isGroupHeader && existing.label === item.label)) {
        compact.push(item);
      }
      rows = 0;
      continue;
    }
    const maxRows = maxRowsByGroup[activeGroup] ?? 8;
    if (rows >= maxRows) continue;
    compact.push(item);
    rows += 1;
  }
  return compact;
}

function firstSentence(text: string, max = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const stop = clean.search(/[.!?]/);
  const s = stop > 0 ? clean.slice(0, stop + 1) : clean;
  return s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** True when a body reads as prose (a caption-worthy excerpt exists) rather
 * than a structured list (birthdays, schedules, dated outings) that
 * parseListItems would already claim for a "list" block. */
function isNarrativeBody(body: string): boolean {
  return parseListItems(body).length < 2;
}

function blockCenter(block: LayoutBlock): { x: number; y: number } {
  return {
    x: block.position.col + block.position.colSpan / 2,
    y: block.position.row + block.position.rowSpan / 2,
  };
}

function blockDistance(a: LayoutBlock, b: LayoutBlock): number {
  const ca = blockCenter(a);
  const cb = blockCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

/**
 * Find the nearest same-page text block whose article reads as prose (not a
 * birthday/schedule list), so an image's caption can be grounded in the
 * story it actually illustrates instead of a generic stock-photo caption.
 */
function findNearbyNarrativeArticle(
  imageBlock: LayoutBlock,
  allBlocks: LayoutBlock[],
  articleById: Map<string, Article>,
): Article | undefined {
  let best: { article: Article; distance: number } | undefined;
  for (const candidate of allBlocks) {
    if (candidate.blockId === imageBlock.blockId) continue;
    if (candidate.page !== imageBlock.page) continue;
    if (!candidate.articleId) continue;
    const article = articleById.get(candidate.articleId);
    if (!article || !isNarrativeBody(article.body)) continue;
    const distance = blockDistance(imageBlock, candidate);
    if (!best || distance < best.distance) best = { article, distance };
  }
  return best?.article;
}

/** A short, specific caption drawn from the adjacent article's own text —
 * never invents facts, just excerpts the story the photo sits beside. */
function captionFromArticle(article: Article): string | undefined {
  const sentence = firstSentence(article.body, 100);
  if (sentence.length >= 15) return sentence;
  const title = article.title.trim();
  return title.length >= 4 ? title : undefined;
}

function roleFor(block: LayoutBlock, title = "", body = ""): PanelRole | null {
  const haystack = `${block.styleTag ?? ""} ${title} ${body.slice(0, 240)}`;
  if (BIRTHDAY_RE.test(haystack)) return "birthday";
  if (/exec|director|letter|corner/i.test(haystack)) return "directorCorner";
  if (/happy hour/i.test(haystack)) return "happyHour";
  if (/upcoming[- ]events|events panel/i.test(haystack)) return "upcomingEvents";
  if (SPOTLIGHT_RE.test(haystack)) return "spotlightRail";
  if (FEATURE_BAND_RE.test(haystack)) return "featureBand";
  if (VOLUNTEER_RE.test(haystack)) return "volunteerCallout";
  if (INFO_FOOTER_RE.test(haystack)) return "infoFooter";
  if (OUTING_RE.test(haystack)) return "outingList";
  if (/collage|photoCluster|photo-cluster/i.test(haystack)) return "photoCluster";
  return null;
}

function applyRoleDefaults(block: LayoutBlock, role: PanelRole): void {
  block.style ??= {};
  block.style.panelRole = block.style.panelRole ?? role;
  switch (role) {
    case "birthday":
      block.style.bg = "sun";
      block.style.headerColor = "navy";
      block.style.scriptHeading = true;
      block.style.cornerRadius = 0;
      block.heading = block.heading ?? "Happy Birthday!";
      break;
    case "directorCorner":
      block.style.bg = "cream";
      block.style.headerColor = "navy";
      block.style.scriptHeading = true;
      block.style.cornerRadius = 18;
      block.heading = block.heading ?? "Executive Director Corner";
      break;
    case "happyHour":
      delete block.style.bg;
      block.style.headerColor = "primary";
      block.style.centered = true;
      block.style.compact = true;
      block.heading = "Happy Hour";
      break;
    case "upcomingEvents":
      delete block.style.bg;
      block.style.headerColor = "berry";
      block.style.centered = true;
      block.style.compact = true;
      block.heading = "Upcoming Events";
      break;
    case "outingList":
      delete block.style.bg;
      block.style.headerColor = "coral";
      block.style.centered = true;
      block.style.compact = true;
      block.heading = "Out and About";
      break;
    case "spotlightRail":
      block.style.bg = "berry";
      block.style.headerColor = "navy";
      block.style.centered = true;
      block.style.compact = true;
      block.style.cornerRadius = 0;
      break;
    case "featureBand":
      block.style.bg = "sky";
      block.style.headerColor = "navy";
      block.style.centered = true;
      block.style.compact = true;
      block.style.cornerRadius = 0;
      break;
    case "volunteerCallout":
      delete block.style.bg;
      block.style.headerColor = "leaf";
      block.style.centered = true;
      block.style.compact = true;
      block.heading = "Make the Difference";
      break;
    case "infoFooter":
      block.style.bg = "navy";
      block.style.headerColor = "paper";
      block.style.invertText = true;
      block.style.centered = true;
      block.style.compact = true;
      block.style.cornerRadius = 0;
      block.heading = block.heading ?? "Trust Funds";
      break;
    case "photoCluster":
      block.style.photoTreatment = block.style.photoTreatment ?? "collage";
      break;
  }
}

export interface VibrancyInput {
  layout: AssembledLayout;
  articles: Article[];
  images: NewsImage[];
  visualPersonality?: VisualPersonality;
}

export function applyVibrancyPass(input: VibrancyInput): AssembledLayout {
  const articleById = new Map(input.articles.map((a) => [a.id, a]));
  const imageById = new Map(input.images.map((i) => [i.id, i]));
  const visualPersonality =
    input.visualPersonality ?? input.layout.visualPersonality ?? "classic-community";
  const personality = PERSONALITY_STYLES[visualPersonality];
  const headerRotation = personality?.headerRotation ?? HEADER_ROTATION;
  const panelRotation = personality?.panelRotation ?? PANEL_ROTATION;
  const defaultCornerRadius = personality?.defaultCornerRadius ?? 8;
  const defaultPhotoTreatment = personality?.photoTreatment ?? "rounded";
  let headerIdx = 0;
  let panelIdx = 0;

  const blocks: LayoutBlock[] = input.layout.blocks.map((block) => {
    const next: LayoutBlock = { ...block, style: { ...(block.style ?? {}) } };
    const article = next.articleId ? articleById.get(next.articleId) : undefined;
    const tagPanel = panelFromStyleTag(next.styleTag);
    if (tagPanel && !next.style!.bg) next.style!.bg = tagPanel;

    const looksBirthday =
      BIRTHDAY_RE.test(article?.title ?? "") ||
      article?.articleType === "birthday" ||
      /birthday/i.test(next.styleTag ?? "");
    const looksSchedule =
      SCHEDULE_RE.test(article?.title ?? "") ||
      OUTING_RE.test(article?.title ?? "") ||
      /schedule|events|outing|out-and-about/i.test(next.styleTag ?? "");
    const role = next.style?.panelRole ?? roleFor(next, article?.title, article?.body);

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
        next.listItems = looksBirthday ? compactBirthdayItems(items, next) : items;
        next.heading = next.heading ?? article.title;
        if (looksBirthday) {
          next.style!.bg = next.style!.bg ?? "sun";
          next.style!.scriptHeading = next.style!.scriptHeading ?? true;
          next.style!.panelRole = next.style!.panelRole ?? "birthday";
        } else {
          next.style!.bg =
            next.style!.bg ?? panelRotation[panelIdx++ % panelRotation.length];
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
      next.style!.bg = panelRotation[panelIdx++ % panelRotation.length];
    }
    if (/exec|director|letter|corner/i.test(next.styleTag ?? "") || /director/i.test(article?.title ?? "")) {
      next.style!.bg = next.style!.bg ?? "cream";
      next.style!.scriptHeading = next.style!.scriptHeading ?? true;
      next.style!.panelRole = next.style!.panelRole ?? "directorCorner";
      next.heading = next.heading ?? "Executive Director Corner";
    }

    if (role) {
      applyRoleDefaults(next, role);
    }

    // --- Feature headers get rotating colors ---
    if (
      (next.kind === "article" || next.kind === "recurring") &&
      article &&
      !next.style!.headerColor
    ) {
      next.style!.headerColor =
        headerRotation[headerIdx++ % headerRotation.length];
      next.heading = next.heading ?? article.title;
    }

    // --- Every image gets a caption, grounded in nearby story context ---
    if (next.kind === "image" && next.imageId) {
      const img = imageById.get(next.imageId);
      if (!next.caption) {
        const isRealUpload = img?.source === "UPLOAD" && !!img.caption;
        const nearbyArticle = isRealUpload
          ? undefined
          : findNearbyNarrativeArticle(next, input.layout.blocks, articleById);
        next.caption =
          (isRealUpload ? img?.caption : undefined) ??
          (nearbyArticle ? captionFromArticle(nearbyArticle) : undefined) ??
          img?.caption ??
          (img?.alt ? firstSentence(img.alt) : undefined) ??
          "A wonderful moment around campus!";
      }
      if (/collage|photo[- ]?cluster/i.test(next.styleTag ?? "")) {
        next.style!.panelRole = next.style!.panelRole ?? "photoCluster";
        next.style!.photoTreatment = next.style!.photoTreatment ?? "collage";
        next.caption = undefined;
      } else if (/portrait/i.test(next.styleTag ?? "")) {
        next.style!.photoTreatment = next.style!.photoTreatment ?? "portrait";
      } else if (/wide|hero/i.test(next.styleTag ?? "")) {
        next.style!.photoTreatment = next.style!.photoTreatment ?? "wide";
      } else {
        next.style!.photoTreatment = next.style!.photoTreatment ?? defaultPhotoTreatment;
      }
    }

    if (next.style && next.style.bg && next.style.cornerRadius == null) {
      next.style.cornerRadius = defaultCornerRadius;
    }

    // --- Dark panels invert text ---
    if (next.style!.bg && DARK_TOKENS.has(next.style!.bg)) {
      next.style!.invertText = next.style!.invertText ?? true;
    }

    // Drop empty style objects to keep stored JSON tidy.
    if (next.style && Object.keys(next.style).length === 0) delete next.style;
    return next;
  });

  return { ...input.layout, visualPersonality, blocks };
}
