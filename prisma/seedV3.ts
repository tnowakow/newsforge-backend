/**
 * v3 seed — five 2-page "inner spread" templates recreated from real
 * Porter One reference newsletters (11×17 spread = two facing letter
 * pages). Standalone on purpose: run AFTER the base seed, idempotent:
 *
 *   npx tsx prisma/seedV3.ts
 *
 * Grid: 24 columns × 16 rows per page (double the v2 resolution — finer
 * editor snapping and truer proportions vs. the reference layouts).
 *
 * Slot styleTags carry design-language hints the vibrancy pass and AI
 * designer understand:  panel:<token>, birthdays, schedule, events,
 * exec-corner, collage, hero, caption.
 */
import { PrismaClient } from "@prisma/client";
import type { TemplateSlot } from "../packages/shared/schemas/index.js";

const prisma = new PrismaClient();

const COLS = 24;
const ROWS = 16;

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

function tally(slots: TemplateSlot[]) {
  const t: Record<string, number> = {
    headline: 0, body: 0, image: 0, sidebar: 0,
    calendar: 0, spotlight: 0, filler: 0, list: 0,
  };
  for (const slot of slots) t[slot.type] = (t[slot.type] ?? 0) + 1;
  return t;
}

interface V3Template {
  id: string;
  name: string;
  slots: TemplateSlot[];
  notes: string;
  richness: string[];
}

const TEMPLATES: V3Template[] = [
  // ------------------------------------------------------------------
  // 1. "Spread — Community Classic" (ref: Gateway Springs dense issue)
  //    3 lists, ED corner, 4 features, spotlight rail, 6 photos.
  // ------------------------------------------------------------------
  {
    id: "v3-spread-classic",
    name: "Spread — Community Classic",
    notes: "[v3-spread] Gateway Springs inner-spread target: page 1 mirrors newsletter page 2, page 2 mirrors newsletter page 3.",
    richness: ["MODERATE", "RICH", "EXTRA_RICH"],
    slots: [
      // Inner page 1 = Gateway reference page 2.
      s("cl-p1-bday", 1, "list", 1, 1, 8, 7, {}, "birthdays panel:sun"),
      s("cl-p1-exec", 1, "spotlight", 9, 1, 16, 7, { minWords: 180, maxWords: 360 }, "exec-corner panel:cream"),
      s("cl-p1-happy-hour", 1, "list", 1, 8, 12, 6, {}, "happy-hour schedule"),
      s("cl-p1-upcoming-events", 1, "calendar", 13, 8, 12, 6, { minWords: 160, maxWords: 360 }, "upcoming-events"),
      s("cl-p1-hh-img-a", 1, "image", 1, 14, 4, 3, { aspect: "landscape" }, "photo-cluster collage"),
      s("cl-p1-hh-img-b", 1, "image", 5, 14, 4, 3, { aspect: "portrait" }, "photo-cluster collage"),
      s("cl-p1-hh-img-c", 1, "image", 9, 14, 4, 3, { aspect: "portrait" }, "photo-cluster collage"),
      s("cl-p1-event-img-a", 1, "image", 13, 14, 6, 3, { aspect: "landscape" }, "photo-cluster collage"),
      s("cl-p1-event-img-b", 1, "image", 19, 14, 6, 3, { aspect: "landscape" }, "photo-cluster collage"),

      // Inner page 2 = Gateway reference page 3.
      s("cl-p2-photo-a", 2, "image", 1, 1, 5, 4, { aspect: "portrait" }, "photo-stack portrait"),
      s("cl-p2-photo-b", 2, "image", 1, 5, 5, 5, { aspect: "portrait" }, "photo-stack portrait"),
      s("cl-p2-outings", 2, "list", 6, 1, 11, 7, {}, "out-and-about outings"),
      s("cl-p2-smile", 2, "spotlight", 17, 1, 8, 13, { minWords: 220, maxWords: 520 }, "smile-of-the-month panel:berry"),
      s("cl-p2-feature-band", 2, "body", 6, 8, 11, 4, { minWords: 50, maxWords: 70 }, "scrubbly car-wash feature-band panel:sky"),
      s("cl-p2-volunteer-img", 2, "image", 1, 10, 5, 5, { aspect: "portrait" }, "photo-stack portrait"),
      s("cl-p2-volunteer", 2, "body", 6, 12, 11, 3, { minWords: 70, maxWords: 170 }, "make-the-difference volunteer"),
      s("cl-p2-trust-funds", 2, "body", 1, 15, 24, 2, { minWords: 35, maxWords: 45 }, "trust-funds info-footer panel:navy"),
    ],
  },
  // ------------------------------------------------------------------
  // 2. "Spread — Panel Garden" (ref: Oaks at Jamestown issue)
  //    Panel-heavy rails both sides, two photo-pair features.
  // ------------------------------------------------------------------
  {
    id: "v3-panel-garden",
    name: "Spread — Panel Garden",
    notes: "[v3-spread] Panel-heavy: colored rails flank two photo-pair features; anniversary/announcement panels.",
    richness: ["MODERATE", "RICH"],
    slots: [
      s("pg-p1-bday", 1, "list", 1, 1, 6, 9, {}, "birthdays panel:sun"),
      s("pg-p1-brunch", 1, "sidebar", 1, 10, 6, 3, { maxWords: 25 }, "panel:sky"),
      s("pg-p1-hh", 1, "list", 1, 13, 6, 4, {}, "schedule panel:navy"),
      s("pg-p1-exec", 1, "spotlight", 7, 1, 9, 9, { maxWords: 260 }, "exec-corner panel:cream"),
      s("pg-p1-feat1", 1, "headline", 16, 1, 9, 4, { maxWords: 140 }),
      s("pg-p1-img1", 1, "image", 16, 5, 9, 5, { aspect: "landscape" }, "caption"),
      s("pg-p1-feat2", 1, "body", 7, 10, 9, 3, { maxWords: 120 }),
      s("pg-p1-img2", 1, "image", 7, 13, 4, 4, { aspect: "portrait" }, "caption"),
      s("pg-p1-img3", 1, "image", 11, 13, 5, 4, { aspect: "portrait" }, "caption"),
      s("pg-p1-img4", 1, "image", 16, 10, 9, 7, { aspect: "landscape" }, "caption"),
      s("pg-p2-feat3", 2, "headline", 1, 1, 12, 4, { maxWords: 120 }),
      s("pg-p2-img5", 2, "image", 1, 5, 6, 6, { aspect: "portrait" }, "caption"),
      s("pg-p2-img6", 2, "image", 7, 5, 6, 6, { aspect: "portrait" }, "caption"),
      s("pg-p2-feat4", 2, "body", 1, 11, 12, 6, { minWords: 80, maxWords: 220 }),
      s("pg-p2-events", 2, "list", 13, 1, 6, 6, {}, "events panel:coral"),
      s("pg-p2-holiday", 2, "image", 13, 7, 6, 4, { aspect: "square" }),
      s("pg-p2-anniv", 2, "sidebar", 19, 1, 6, 10, { maxWords: 220 }, "panel:sky"),
      s("pg-p2-legacy", 2, "sidebar", 13, 11, 12, 6, { maxWords: 200 }, "panel:berry"),
    ],
  },
  // ------------------------------------------------------------------
  // 3. "Spread — Resident Feature" (ref: Morgan Township issue)
  //    Hero resident story with big portrait; caption-heavy photo story.
  // ------------------------------------------------------------------
  {
    id: "v3-resident-feature",
    name: "Spread — Resident Feature",
    notes: "[v3-spread] Hero resident spotlight with dominant portrait; captioned photo story on the right page.",
    richness: ["MODERATE", "RICH", "EXTRA_RICH"],
    slots: [
      s("rf-p1-bday", 1, "list", 1, 1, 6, 10, {}, "birthdays panel:sun"),
      s("rf-p1-legacy", 1, "sidebar", 1, 11, 6, 6, { maxWords: 60 }, "panel:berry"),
      s("rf-p1-exec", 1, "spotlight", 7, 1, 9, 9, { maxWords: 260 }, "exec-corner panel:cream"),
      s("rf-p1-spot", 1, "headline", 7, 10, 9, 3, { maxWords: 90 }, "hero"),
      s("rf-p1-img1", 1, "image", 7, 13, 9, 4, { aspect: "portrait" }, "caption hero-portrait"),
      s("rf-p1-img2", 1, "image", 16, 1, 9, 6, { aspect: "landscape" }, "caption"),
      s("rf-p1-feat1", 1, "body", 16, 7, 9, 10, { minWords: 100, maxWords: 300 }),
      s("rf-p2-feat2", 2, "headline", 1, 1, 12, 3, { maxWords: 80 }),
      s("rf-p2-img3", 2, "image", 1, 4, 12, 7, { aspect: "landscape" }, "caption hero"),
      s("rf-p2-img4", 2, "image", 1, 11, 12, 6, { aspect: "landscape" }, "caption"),
      s("rf-p2-dates", 2, "list", 13, 1, 12, 3, {}, "events panel:coral"),
      s("rf-p2-side", 2, "sidebar", 13, 4, 12, 5, { maxWords: 120 }, "panel:sky"),
      s("rf-p2-img5", 2, "image", 13, 9, 6, 5, { aspect: "portrait" }, "caption"),
      s("rf-p2-img6", 2, "image", 19, 9, 6, 5, { aspect: "portrait" }, "caption"),
      s("rf-p2-img7", 2, "image", 13, 14, 12, 3, { aspect: "landscape" }, "caption"),
    ],
  },
  // ------------------------------------------------------------------
  // 4. "Spread — Photo Festival" (ref: Stonecroft carnival issue)
  //    Collage-driven: two multi-photo grids, small callout panels.
  // ------------------------------------------------------------------
  {
    id: "v3-photo-festival",
    name: "Spread — Photo Festival",
    notes: "[v3-spread] Photo-dominant: collage grids for event recaps, compact callout panels, minimal body text.",
    richness: ["RICH", "EXTRA_RICH"],
    slots: [
      s("pf-p1-bday", 1, "list", 1, 1, 6, 9, {}, "birthdays panel:sun"),
      s("pf-p1-hh", 1, "list", 1, 10, 6, 7, {}, "schedule panel:navy"),
      s("pf-p1-exec", 1, "spotlight", 7, 1, 9, 8, { maxWords: 240 }, "exec-corner panel:cream"),
      s("pf-p1-head1", 1, "headline", 16, 1, 9, 3, { maxWords: 28 }, "panel:sky"),
      s("pf-p1-img1", 1, "image", 16, 4, 5, 4, { aspect: "landscape" }, "collage"),
      s("pf-p1-img2", 1, "image", 21, 4, 4, 4, { aspect: "portrait" }, "collage"),
      s("pf-p1-img3", 1, "image", 16, 8, 4, 4, { aspect: "portrait" }, "collage"),
      s("pf-p1-img4", 1, "image", 20, 8, 5, 4, { aspect: "landscape" }, "collage"),
      s("pf-p1-callout", 1, "sidebar", 7, 9, 9, 3, { maxWords: 50 }, "panel:blush"),
      s("pf-p1-img5", 1, "image", 7, 12, 9, 5, { aspect: "landscape" }, "caption"),
      s("pf-p1-img6", 1, "image", 16, 12, 9, 5, { aspect: "landscape" }, "caption"),
      s("pf-p2-head2", 2, "headline", 1, 1, 12, 2, { maxWords: 40 }),
      s("pf-p2-img7", 2, "image", 1, 3, 6, 5, {}, "collage"),
      s("pf-p2-img8", 2, "image", 7, 3, 6, 5, {}, "collage"),
      s("pf-p2-img9", 2, "image", 1, 8, 6, 5, {}, "collage"),
      s("pf-p2-img10", 2, "image", 7, 8, 6, 5, {}, "collage"),
      s("pf-p2-img13", 2, "image", 1, 13, 12, 4, { aspect: "landscape" }, "caption"),
      s("pf-p2-out", 2, "sidebar", 13, 1, 6, 9, { maxWords: 160 }, "panel:sky"),
      s("pf-p2-img11", 2, "image", 19, 1, 6, 9, { aspect: "portrait" }, "caption"),
      s("pf-p2-small1", 2, "sidebar", 13, 10, 6, 4, { maxWords: 34 }, "trust-funds info-footer panel:navy"),
      s("pf-p2-small2", 2, "filler", 13, 14, 6, 3, { maxWords: 24 }, "quiet-space"),
      s("pf-p2-img12", 2, "image", 19, 10, 6, 7, { aspect: "portrait" }, "caption"),
    ],
  },
  // ------------------------------------------------------------------
  // 5. "Spread — Editorial Light" (ref: staff-spotlight sparse issue)
  //    Sparse content: one long wellness feature, staff trio, big photo.
  // ------------------------------------------------------------------
  {
    id: "v3-editorial-light",
    name: "Spread — Editorial Light",
    notes: "[v3-spread] Sparse months: one long feature across columns, staff spotlight trio with portraits, one hero photo.",
    richness: ["SIMPLE", "MODERATE"],
    slots: [
      s("el-p1-bday", 1, "list", 1, 1, 6, 5, {}, "birthdays panel:sun"),
      s("el-p1-holiday", 1, "sidebar", 1, 6, 6, 6, { maxWords: 45 }, "panel:navy"),
      s("el-p1-exec", 1, "spotlight", 7, 1, 9, 11, { maxWords: 320 }, "exec-corner panel:cream"),
      s("el-p1-feat1", 1, "headline", 16, 1, 9, 8, { minWords: 90, maxWords: 260 }, "hero"),
      s("el-p1-img1", 1, "image", 16, 9, 9, 8, { aspect: "portrait" }, "caption hero"),
      s("el-p1-spot-head", 1, "headline", 1, 12, 15, 2, { maxWords: 12 }),
      s("el-p1-spot1", 1, "body", 1, 14, 5, 3, { maxWords: 28 }),
      s("el-p1-spot2", 1, "body", 6, 14, 5, 3, { maxWords: 28 }),
      s("el-p1-spot3", 1, "body", 11, 14, 5, 3, { maxWords: 28 }),
      s("el-p2-img1", 2, "image", 1, 1, 8, 8, { aspect: "portrait" }, "caption"),
      s("el-p2-img2", 2, "image", 9, 1, 8, 8, { aspect: "portrait" }, "caption"),
      s("el-p2-img3", 2, "image", 17, 1, 8, 8, { aspect: "portrait" }, "caption"),
      s("el-p2-img4", 2, "image", 1, 9, 24, 8, { aspect: "landscape" }, "caption hero"),
    ],
  },
];

async function main() {
  for (const t of TEMPLATES) {
    const data = {
      name: t.name,
      pageCount: 2,
      gridSpec: {
        label: t.id,
        columns: COLS,
        rowsPerPage: ROWS,
        slots: t.slots,
      } as unknown as object,
      slotTypes: tally(t.slots) as unknown as object,
      compatibilityHints: {
        richness: t.richness,
        careLevels: ["INDEPENDENT_LIVING", "ASSISTED_LIVING", "MEMORY_CARE", "MIXED"],
        notes: t.notes,
      } as unknown as object,
    };
    await prisma.template.upsert({
      where: { id: t.id },
      create: { id: t.id, ...data },
      update: data,
    });
    console.log(`✓ ${t.id} — ${t.name} (${t.slots.length} slots)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
