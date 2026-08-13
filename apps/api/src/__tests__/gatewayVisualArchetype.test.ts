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
  assert.equal(bySlot.get("happy-hour")?.style?.bg, "sky");
  assert.equal(bySlot.get("happy-hour")?.style?.headerColor, "navy");
  assert.equal(bySlot.get("happy-hour")?.style?.invertText, false);
  assert.equal(bySlot.get("upcoming")?.style?.panelRole, "upcomingEvents");
  assert.equal(bySlot.get("upcoming")?.style?.bg, "cream");
  assert.equal(bySlot.get("upcoming")?.style?.headerColor, "coral");
  assert.equal(bySlot.get("outings")?.style?.panelRole, "outingList");
  assert.equal(bySlot.get("outings")?.kind, "list");
  assert.equal(bySlot.get("smile")?.style?.panelRole, "spotlightRail");
  assert.equal(bySlot.get("feature-band")?.style?.panelRole, "featureBand");
  assert.equal(bySlot.get("volunteer")?.style?.panelRole, "volunteerCallout");
  assert.equal(bySlot.get("trust")?.style?.panelRole, "infoFooter");
});

test("semantic slots are not filled with unrelated articles", () => {
  const gridSpec: GridSpec = {
    label: "semantic-guard",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      slot("birthdays", 1, "list", 1, 1, 6, 5, "birthdays panel:sun"),
      slot("general", 1, "body", 7, 1, 6, 5),
    ],
  };
  const articles: Article[] = [
    {
      id: "a-profile",
      title: "The Best Friends Approach in Action",
      body: "A resident profile belongs in a general feature slot, not a birthday module.",
      wordCount: 12,
      articleType: "resident-story",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: [],
  });

  const bySlot = new Map(layout.blocks.map((block) => [block.slotId, block]));
  assert.equal(bySlot.get("birthdays")?.articleId, undefined);
  assert.equal(bySlot.get("birthdays")?.needsFiller, true);
  assert.equal(bySlot.get("general")?.articleId, "a-profile");
});

test("generic slots do not steal articles needed by later semantic slots", () => {
  const gridSpec: GridSpec = {
    label: "semantic-preserve",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      slot("general", 1, "body", 1, 1, 6, 5),
      slot("birthdays", 1, "list", 7, 1, 6, 5, "birthdays panel:sun"),
    ],
  };
  const articles: Article[] = [
    {
      id: "a-birthday",
      title: "Happy Birthday!",
      body: "RESIDENTS\nMary A. 7/3",
      wordCount: 3,
      articleType: "birthday",
      isFiller: false,
      source: "MOCK",
    },
    {
      id: "a-general",
      title: "Summer Flavors From the Kitchen",
      body: "The kitchen is leaning into summer with crisp salads and grilled favorites.",
      wordCount: 11,
      articleType: "announcement",
      isFiller: false,
      source: "MOCK",
    },
    {
      id: "a-long",
      title: "Protecting Your Skin During UV Safety Month",
      body: "A useful wellness story can still be too long for a tiny recurring fallback slot.",
      wordCount: 95,
      articleType: "announcement",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: [],
  });

  const bySlot = new Map(layout.blocks.map((block) => [block.slotId, block]));
  assert.equal(bySlot.get("general")?.articleId, "a-general");
  assert.equal(bySlot.get("birthdays")?.articleId, "a-birthday");
});

test("generic slots do not reuse semantic articles after their home slot passes", () => {
  const gridSpec: GridSpec = {
    label: "semantic-past-home",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      slot("birthdays", 1, "list", 1, 1, 6, 5, "birthdays panel:sun"),
      slot("general", 1, "body", 7, 1, 6, 5),
    ],
  };
  const articles: Article[] = [
    {
      id: "a-birthday",
      title: "Happy Birthday!",
      body: "RESIDENTS\nMary A. 7/3",
      wordCount: 3,
      articleType: "birthday",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: [],
  });

  const bySlot = new Map(layout.blocks.map((block) => [block.slotId, block]));
  assert.equal(bySlot.get("birthdays")?.articleId, "a-birthday");
  assert.equal(bySlot.get("general")?.articleId, undefined);
});

test("generic recurring fallbacks do not steal semantic articles", () => {
  const gridSpec: GridSpec = {
    label: "semantic-recurring-fallback",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      slot("birthdays", 1, "list", 1, 1, 6, 5, "birthdays panel:sun"),
      { ...slot("spotlight", 1, "body", 7, 1, 6, 5), capacity: { maxWords: 28 } },
    ],
  };
  const articles: Article[] = [
    {
      id: "a-birthday",
      title: "Happy Birthday!",
      body: "RESIDENTS\nMary A. 7/3",
      wordCount: 3,
      articleType: "birthday",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: [
      { id: "sec-spotlight", title: "Spotlight", slotHint: "body", wordTarget: 60, required: false },
    ],
  });

  const bySlot = new Map(layout.blocks.map((block) => [block.slotId, block]));
  assert.equal(bySlot.get("birthdays")?.articleId, "a-birthday");
  assert.equal(bySlot.get("spotlight")?.articleId, undefined);
  assert.equal(bySlot.get("spotlight")?.needsFiller, true);
});

test("birthday modules preserve the full roster for layout repair", () => {
  const body = [
    "RESIDENTS",
    "Mary A. 7/3",
    "Shirley S. 7/10",
    "Janice F. 7/22",
    "Michael V. 7/27",
    "Joan C. 7/31",
    "STAFF",
    "Erica M. 7/1",
    "Shristy P. 7/3",
    "Jed N. 7/3",
    "Adam J. 7/4",
    "Gracey C. 7/8",
    "Deborah R. 7/11",
  ].join("\n");
  const articles: Article[] = [
    {
      id: "a-birthday",
      title: "Happy Birthday!",
      body,
      wordCount: 26,
      articleType: "birthday",
      isFiller: false,
      source: "MOCK",
    },
  ];
  const layout = applyVibrancyPass({
    layout: {
      templateId: "v3-editorial-light",
      pageCount: 1,
      version: 1,
      blocks: [
        {
          blockId: "b1",
          slotId: "birthdays",
          page: 1,
          position: { col: 1, row: 1, colSpan: 6, rowSpan: 5 },
          kind: "article",
          articleId: "a-birthday",
          styleTag: "birthdays panel:sun",
          needsFiller: false,
        },
      ],
      unfilledSlotIds: [],
      stats: { placedArticles: 1, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
    },
    articles,
    images: [],
  });

  assert.equal(layout.blocks[0]?.kind, "list");
  assert.equal(layout.blocks[0]?.listItems?.length, 13);
});

test("vibrancy pass applies selected visual personality to panel and image defaults", () => {
  const articles: Article[] = [
    {
      id: "a-event",
      title: "Campus Notes",
      body: "Residents enjoyed a bright afternoon together around campus.",
      wordCount: 8,
      articleType: "announcement",
      isFiller: false,
      source: "MOCK",
    },
  ];
  const layout = applyVibrancyPass({
    layout: {
      templateId: "v3-spread-classic",
      pageCount: 1,
      version: 1,
      blocks: [
        {
          blockId: "b1",
          slotId: "events",
          page: 1,
          position: { col: 1, row: 1, colSpan: 6, rowSpan: 4 },
          kind: "article",
          articleId: "a-event",
          styleTag: "panel:sky",
          needsFiller: false,
        },
        {
          blockId: "i1",
          slotId: "photo",
          page: 1,
          position: { col: 7, row: 1, colSpan: 6, rowSpan: 4 },
          kind: "image",
          imageId: "img-1",
          needsFiller: false,
        },
      ],
      unfilledSlotIds: [],
      stats: { placedArticles: 1, placedImages: 1, fillerBlocks: 0, emptySlots: 0 },
    },
    articles,
    images: [
      {
        id: "img-1",
        url: "https://example.com/photo.jpg",
        aspect: "landscape",
        isPlaceholder: false,
        source: "STOCK",
      },
    ],
    visualPersonality: "celebration-pop",
  });

  assert.equal(layout.visualPersonality, "celebration-pop");
  assert.equal(layout.blocks[0]?.style?.cornerRadius, 4);
  assert.equal(layout.blocks[1]?.style?.photoTreatment, "collage");
});

test("vibrancy pass normalizes Porter panels away from low-contrast color combinations", () => {
  const articles: Article[] = [
    {
      id: "a-legacy",
      title: "Legacy News",
      body: "Residents and families shared a warm memory-care moment together.",
      wordCount: 9,
      articleType: "resident-story",
      isFiller: false,
      source: "UPLOAD",
    },
    {
      id: "a-happy",
      title: "Happy Hours",
      body: "7/3 America Bash\n7/10 Dog Days of Summer",
      wordCount: 8,
      articleType: "event-recap",
      isFiller: false,
      source: "UPLOAD",
    },
  ];
  const layout = applyVibrancyPass({
    layout: {
      templateId: "v3-panel-garden",
      pageCount: 1,
      version: 1,
      blocks: [
        {
          blockId: "legacy",
          slotId: "legacy",
          page: 1,
          position: { col: 1, row: 1, colSpan: 6, rowSpan: 4 },
          kind: "article",
          articleId: "a-legacy",
          style: { bg: "berry", headerColor: "cream", invertText: true, panelRole: "spotlightRail" },
          needsFiller: false,
        },
        {
          blockId: "happy",
          slotId: "happy",
          page: 1,
          position: { col: 7, row: 1, colSpan: 6, rowSpan: 4 },
          kind: "article",
          articleId: "a-happy",
          style: { bg: "sun", headerColor: "sun", invertText: true, panelRole: "happyHour" },
          needsFiller: false,
        },
      ],
      unfilledSlotIds: [],
      stats: { placedArticles: 2, placedImages: 0, fillerBlocks: 0, emptySlots: 0 },
    },
    articles,
    images: [],
  });

  assert.equal(layout.blocks[0]?.style?.bg, "berry");
  assert.equal(layout.blocks[0]?.style?.headerColor, "navy");
  assert.equal(layout.blocks[0]?.style?.invertText, false);
  assert.equal(layout.blocks[1]?.kind, "list");
  assert.equal(layout.blocks[1]?.style?.bg, "sky");
  assert.equal(layout.blocks[1]?.style?.headerColor, "navy");
  assert.equal(layout.blocks[1]?.style?.invertText, false);
});


test("large sparse general slots accept useful articles below ideal minWords", () => {
  const gridSpec: GridSpec = {
    label: "sparse-general",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      {
        ...slot("hero", 1, "headline", 1, 1, 12, 8, "hero"),
        capacity: { minWords: 250, maxWords: 700 },
      },
    ],
  };
  const articles: Article[] = [
    {
      id: "a-feature",
      title: "Protecting Your Skin During UV Safety Month",
      body: "A short but useful wellness feature should expand into the large sparse slot.",
      wordCount: 12,
      articleType: "announcement",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: [],
  });

  assert.equal(layout.blocks[0]?.articleId, "a-feature");
  assert.equal(layout.blocks[0]?.needsFiller, false);
});

test("tiny general slots do not accept oversized fallback articles", () => {
  const gridSpec: GridSpec = {
    label: "brief-overflow-guard",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      {
        ...slot("brief", 1, "body", 1, 1, 4, 2),
        capacity: { maxWords: 45 },
      },
    ],
  };
  const articles: Article[] = [
    {
      id: "a-long",
      title: "Protecting Your Skin During UV Safety Month",
      body: "A useful wellness story can still be too long for a tiny brief slot, so it should not be silently clipped by the renderer.",
      wordCount: 95,
      articleType: "announcement",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: [],
  });

  assert.equal(layout.blocks[0]?.articleId, undefined);
  assert.equal(layout.blocks[0]?.needsFiller, true);
});

test("recurring body articles expand into compatible feature slots before tiny body slots", () => {
  const gridSpec: GridSpec = {
    label: "recurring-feature-expansion",
    columns: 12,
    rowsPerPage: 10,
    slots: [
      {
        ...slot("feature", 1, "headline", 1, 1, 8, 6),
        capacity: { minWords: 80, maxWords: 220 },
      },
      {
        ...slot("brief", 1, "body", 9, 1, 4, 2),
        capacity: { maxWords: 55 },
      },
    ],
  };
  const sections: RecurringSection[] = [
    {
      id: "wellness",
      title: "Wellness Feature",
      slotHint: "body",
      wordTarget: 140,
      required: true,
    },
  ];
  const articles: Article[] = [
    {
      id: "a-wellness",
      sectionId: "wellness",
      title: "Protecting Your Skin During UV Safety Month",
      body: "A medium recurring story should claim the compatible feature region instead of being clipped in a tiny body slot.",
      wordCount: 130,
      articleType: "announcement",
      isFiller: false,
      source: "MOCK",
    },
  ];

  const layout = assembleLayout({
    templateId: "v3-editorial-light",
    pageCount: 1,
    gridSpec,
    articles,
    images: [],
    recurringSections: sections,
  });
  const bySlot = new Map(layout.blocks.map((block) => [block.slotId, block]));

  assert.equal(bySlot.get("feature")?.articleId, "a-wellness");
  assert.equal(bySlot.get("feature")?.kind, "recurring");
  assert.equal(bySlot.get("brief")?.articleId, undefined);
});
