import assert from "node:assert/strict";
import test from "node:test";
import type {
  Article,
  GridSpec,
  RecurringSection,
  TemplateSlot,
} from "@newsforge/shared/schemas";
import { assembleLayout } from "../services/layoutAssembly.js";
import { applyVibrancyPass } from "../services/vibrancyPass.js";

function slot(
  id: string,
  page: number,
  type: TemplateSlot["type"],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  styleTag?: string,
): TemplateSlot {
  return {
    id,
    page,
    type,
    col,
    row,
    colSpan,
    rowSpan,
    capacity: {},
    styleTag,
  };
}

test("Gateway-style inner spread lands key content in the intended archetype slots", () => {
  const gridSpec: GridSpec = {
    label: "v3-spread-classic",
    columns: 24,
    rowsPerPage: 16,
    slots: [
      slot("birthdays", 1, "list", 1, 1, 8, 7, "birthdays panel:sun"),
      slot("director", 1, "spotlight", 9, 1, 16, 7, "exec-corner panel:cream"),
      slot("happy-hour", 1, "list", 1, 8, 12, 6, "happy-hour schedule"),
      slot("upcoming", 1, "calendar", 13, 8, 12, 6, "upcoming-events"),
      slot("outings", 2, "list", 6, 1, 11, 6, "out-and-about outings"),
      slot("smile", 2, "spotlight", 17, 1, 8, 12, "smile-of-the-month panel:berry"),
      slot("feature-band", 2, "body", 1, 7, 16, 4, "scrubbly car-wash feature-band panel:sky"),
      slot("volunteer", 2, "body", 6, 11, 11, 4, "make-the-difference volunteer"),
      slot("trust", 2, "body", 1, 15, 24, 2, "trust-funds info-footer panel:navy"),
    ],
  };

  const recurringSections: RecurringSection[] = [
    { id: "sec-director", title: "From the Director", slotHint: "spotlight", wordTarget: 260, required: true },
    { id: "sec-feature", title: "Feature Story", slotHint: "body", wordTarget: 160, required: true },
    { id: "sec-calendar", title: "Activities Calendar", slotHint: "calendar", wordTarget: 180, required: false },
    { id: "sec-birthdays", title: "Birthdays", slotHint: "sidebar", wordTarget: 60, required: false },
  ];

  const articles: Article[] = [
    { id: "a-bday", title: "Happy Birthday!", body: "RESIDENTS\nMary A. 7/3\nSTAFF\nErica M. 7/1", wordCount: 6, articleType: "birthday", sectionId: "sec-birthdays", isFiller: false, source: "MOCK" },
    { id: "a-director", title: "Executive Director Corner", body: "Happy July, everyone. Have a great month.", wordCount: 7, articleType: "executive-note", sectionId: "sec-director", isFiller: false, source: "MOCK" },
    { id: "a-feature", title: "Scrubbly Bubbly Car Wash", body: "Residents recently rolled into our Scrubbly Bubbly Car Wash for a fresh shine.", wordCount: 12, articleType: "event-recap", sectionId: "sec-feature", isFiller: false, source: "MOCK" },
    { id: "a-hh", title: "Happy Hour", body: "7/3 Red, White, and BOOZE\n7/10 Cruisin' Through Happy Hour", wordCount: 8, articleType: "announcement", isFiller: false, source: "MOCK" },
    { id: "a-upcoming", title: "Upcoming Events", body: "Join us for Cruise Day and Break for Brunch.", wordCount: 9, articleType: "announcement", sectionId: "sec-calendar", isFiller: false, source: "MOCK" },
    { id: "a-out", title: "Out and About", body: "7/2 Sugar Shack\n7/7 Newport Aquarium", wordCount: 6, articleType: "announcement", isFiller: false, source: "MOCK" },
    { id: "a-smile", title: "Smile of the Month", body: "Meet Robyn J. and learn a little more about her.", wordCount: 10, articleType: "resident-story", isFiller: false, source: "MOCK" },
    { id: "a-volunteer", title: "Make the Difference", body: "Becoming a volunteer is easy.", wordCount: 5, articleType: "announcement", isFiller: false, source: "MOCK" },
    { id: "a-trust", title: "Trust Funds", body: "A Trust Fund helps residents manage outing expenses.", wordCount: 8, articleType: "announcement", isFiller: false, source: "MOCK" },
  ];

  const layout = applyVibrancyPass({
    layout: assembleLayout({
      templateId: "v3-spread-classic",
      pageCount: 2,
      gridSpec,
      articles,
      images: [],
      recurringSections,
    }),
    articles,
    images: [],
  });

  const bySlot = new Map(layout.blocks.map((block) => [block.slotId, block]));
  assert.equal(bySlot.get("birthdays")?.style?.panelRole, "birthday");
  assert.equal(bySlot.get("birthdays")?.kind, "list");
  assert.equal(bySlot.get("happy-hour")?.style?.panelRole, "happyHour");
  assert.equal(bySlot.get("happy-hour")?.kind, "list");
  assert.equal(bySlot.get("outings")?.style?.panelRole, "outingList");
  assert.equal(bySlot.get("outings")?.kind, "list");
  assert.equal(bySlot.get("smile")?.style?.panelRole, "spotlightRail");
  assert.equal(bySlot.get("feature-band")?.style?.panelRole, "featureBand");
  assert.equal(bySlot.get("volunteer")?.style?.panelRole, "volunteerCallout");
  assert.equal(bySlot.get("trust")?.style?.panelRole, "infoFooter");
});
