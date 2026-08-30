import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.AI_UNLOCK_PASSWORD ??= "test-unlock";
process.env.INTERNAL_RENDER_SECRET ??= "test-render";

const service = await import("../services/uploadService.js");

test("Porter parser strips scaffolding, optional menu, and department heads", () => {
  const parsed = service.parsePorterSubmissionText(`
    Instructions and setup text

    Required Articles

    REQUIRED - Executive Directors Corner

    A director note with useful content.

    REQUIRED - Legacy News

    Legacy story body.
    Photos: Legacy.jpg, Legacy 2.jpg

    REQUIRED - Upcoming Campus EventsHappy Hours:

    7/3 Community Bash
    7/10 Summer Camp

    Socials:
    7/8 Watermelon Wednesday

    Brunch
    7/12 July Brunch

    REQUIRED - PHOTO CAPTIONS

    REQUIRED - INTERESTING AND NEWSWORTHY

    Chef Circle brings neighbors together for a shared meal. Photo: Chefs Circle.jpg
    Campus in Color celebrates creativity and community. Photos: Campus in Color.jpg, Campus in Color 2.HEIC
    Out & About - Residents took a trip across town. Photo: Out and About.jpg
    Oaks anniversary marks two years together.
    4. (Optional)

    REQUIRED - DEPARTMENT HEADS

    Private staff roster that must not become content.

    Optional Article Suggestions

    Chef's Corner
    Vitality
  `);
  const text = JSON.stringify(parsed);
  assert.equal(parsed.fallbackRequired, false);
  assert.equal(parsed.articles.length, 6);
  assert.equal(parsed.lists.reduce((sum, list) => sum + list.rows.length, 0), 4);
  assert.equal(parsed.imageAssociations["Legacy.jpg"]?.[0], "legacy");
  assert.deepEqual(
    parsed.articles.find((article) => /^Chef Circle/.test(article.title))?.imageRefs,
    ["Chefs Circle.jpg"],
  );
  assert.deepEqual(
    parsed.articles.find((article) => /^Campus in Color/.test(article.title))?.imageRefs,
    ["Campus in Color.jpg", "Campus in Color 2.HEIC"],
  );
  assert.deepEqual(
    parsed.articles.find((article) => /^Out & About/.test(article.title))?.imageRefs,
    ["Out and About.jpg"],
  );
  assert.doesNotMatch(text, /Photo:|Photos:/);
  assert.doesNotMatch(text, /Private staff roster|Chef's Corner|Vitality|Instructions and setup/);
});

test("Porter parse expands into uploaded run articles instead of one filename article", () => {
  const parsed = service.parsePorterSubmissionText(`
    Required Articles

    REQUIRED - Executive Directors Corner

    A director note with useful content.

    REQUIRED - Legacy News

    Legacy story body.

    REQUIRED - Upcoming Campus EventsHappy Hours:

    7/3 Community Bash
    7/10 Summer Camp

    Socials:
    7/8 Watermelon Wednesday

    Brunch
    7/12 July Brunch

    REQUIRED - PHOTO CAPTIONS

    REQUIRED - INTERESTING AND NEWSWORTHY

    Chef Circle brings neighbors together for a shared meal.
    Campus in Color celebrates creativity and community.
    Oaks anniversary marks two years together.

    REQUIRED - DEPARTMENT HEADS

    Private staff roster that must not become content.

    Optional Article Suggestions
  `);
  const articles = service.porterParseToArticles(parsed);
  const titles = articles.map((article) => article.title);
  const output = JSON.stringify(articles);
  assert.deepEqual(titles, [
    "Executive Director Corner",
    "Legacy News",
    "Chef Circle",
    "Campus in Color celebrates creativity and community",
    "Oaks anniversary marks two years together",
    "Happy Hours",
    "Socials",
    "Brunch",
  ]);
  assert.equal(articles.every((article) => article.source === "UPLOAD"), true);
  assert.equal(articles.every((article) => article.isFiller === false), true);
  assert.doesNotMatch(output, /\.docx|Private staff roster|Optional Article Suggestions/);
});

test("Porter parser cleans numbered interesting/newsworthy labels", () => {
  const parsed = service.parsePorterSubmissionText(`
    Required Articles

    REQUIRED - Executive Directors Corner

    A director note with useful content.

    REQUIRED - INTERESTING AND NEWSWORTHY

    4. Featured Resident of the Month - This month we're celebrating a resident whose story and spirit have made a real impact on our community. Photo: Featured Resident of the Month.jpg

    5. Customer Service Moment - A shoutout to a team member who went above and beyond for a resident this month.

    6. Featured Recipe from the Chef - This month's featured recipe comes straight from a resident's family favorite.

    Optional Article Suggestions
  `);
  assert.equal(parsed.fallbackRequired, false);
  assert.deepEqual(parsed.articles.map((article) => article.title), [
    "Executive Director Corner",
    "Featured Resident of the Month",
    "Customer Service Moment",
    "Featured Recipe from the Chef",
  ]);
  assert.equal(parsed.articles.some((article) => /^[456]$/.test(article.title)), false);
  assert.equal(parsed.articles[1].body.startsWith("Featured Resident of the Month -"), true);
  assert.deepEqual(parsed.articles[1].imageRefs, ["Featured Resident of the Month.jpg"]);
});

test("Porter parser preserves Example-6 style principles without name-specific rules", () => {
  const parsed = service.parsePorterSubmissionText(`
    Required Articles

    REQUIRED - Executive Directors Corner

    A monthly note from the director about summer activities and community connection.
    Photo: Director Portrait.jpg

    REQUIRED - Upcoming Campus EventsUpcoming Events:
    7/1 Music by Greg & Tony; 7/2 Men's Breakfast; 7/3 Happy Hour with Don;
    7/9 Picnic in the Park; 7/15 Senior Karaoke; 7/31 Happy Hour with Johnny A.

    REQUIRED - Happy Birthday
    RESIDENTS
    Jerry L. 7/8
    Michael J. 7/12
    STAFF
    Carla M. 7/3

    REQUIRED - PHOTO CAPTIONS
    Director Portrait.jpg - Executive director portrait (Article: Executive Director Corner) | Outings 1.jpg - Residents enjoying a trip (Article: Outings)
    Outings 2.jpg - Friends on a community outing (Article: Outings)

    REQUIRED - INTERESTING AND NEWSWORTHY

    Outings - Residents joined weekly outings for scenic rides and lunches together. Photo: Outings 1.jpg, Outings 2.jpg
    Wings of Joy Project - Residents partnered with preschool students on a creative intergenerational project. Photo: Wings 1.jpg, Wings 2.jpg

    Optional Article Suggestions
  `);

  assert.equal(parsed.fallbackRequired, false);
  assert.equal(parsed.captions["Director Portrait.jpg"], "Executive director portrait");
  assert.equal(parsed.imageAssociations["Director Portrait.jpg"]?.includes("Executive Director Corner"), true);
  assert.equal(parsed.imageAssociations["Outings 1.jpg"]?.includes("Outings"), true);
  assert.equal(parsed.lists.find((list) => list.label === "Upcoming Events")?.rows.length, 6);
  assert.equal(parsed.lists.find((list) => list.label === "Happy Birthday!")?.panelRole, "birthday");

  const runArticles = service.porterParseToArticles(parsed);
  assert.equal(runArticles.some((article) => article.title === "Upcoming Events" && article.body.includes("7/31 Happy Hour")), true);
  assert.equal(runArticles.some((article) => article.title === "Happy Birthday!" && article.articleType === "birthday"), true);
  assert.deepEqual(runArticles.find((article) => article.title === "Outings")?.imageRefs, ["Outings 1.jpg", "Outings 2.jpg"]);
});

test("Porter parser preserves official month-local entertainment rails", () => {
  const parsed = service.parsePorterSubmissionText(`
    Required Articles

    REQUIRED - Executive Directors Corner
    A director note with useful content.

    REQUIRED - Upcoming Campus Events
    July Entertainment:
    2nd-Country Gentlemen
    3rd-Don Smithey
    10th-Bill Jennings
    16th-Men In Black
    17th-Wesley Hill
    24th-Jeff Davis
    31st-Mark Nightingale

    REQUIRED - PHOTO CAPTIONS
    Caption copy belongs with separately uploaded photos.
    PHOTOS: 4,5,6

    REQUIRED - INTERESTING AND NEWSWORTHY
    4. (Optional)

    Optional Article Suggestions
  `);

  const entertainment = parsed.lists.find((list) => list.label === "July Entertainment");
  assert.deepEqual(entertainment?.rows, [
    { value: "2nd", label: "Country Gentlemen" },
    { value: "3rd", label: "Don Smithey" },
    { value: "10th", label: "Bill Jennings" },
    { value: "16th", label: "Men In Black" },
    { value: "17th", label: "Wesley Hill" },
    { value: "24th", label: "Jeff Davis" },
    { value: "31st", label: "Mark Nightingale" },
  ]);
  assert.equal(service.porterParseToArticles(parsed).some((article) => article.title === "July Entertainment"), true);
});

test("missing Porter markers enters explicit fallback state", () => {
  const parsed = service.parsePorterSubmissionText("A loose document with no structural markers.");
  assert.equal(parsed.fallbackRequired, true);
  assert.equal(parsed.articles.length, 0);
  assert.match(parsed.warnings[0] ?? "", /deterministic-markers-missing/);
});

test("low-resolution placement is informational, never blocking", () => {
  const assessment = service.assessPrintDpi({ width: 600, height: 900, placementWidthInches: 5, minimumDpi: 200, label: "photo3" });
  assert.equal(assessment.belowMinimum, true);
  assert.equal(assessment.effectiveDpi, 120);
  assert.match(assessment.note ?? "", /below 200 DPI/);
});

const realSubmission = path.resolve(process.cwd(), "../../fixtures/trilogy/templates/July Campus Newsletter Content.docx");
if (fs.existsSync(realSubmission)) {
  test("real July submission produces the expected clean parse", async () => {
    const parsed = await service.parsePorterSubmissionFile(realSubmission);
    const output = JSON.stringify(parsed);
    assert.equal(parsed.fallbackRequired, false);
    assert.equal(parsed.articles.length, 5);
    assert.equal(parsed.lists.reduce((sum, list) => sum + list.rows.length, 0), 10);
    assert.equal(parsed.articles.filter((article) => article.sectionId === "features").length, 3);
    assert.equal(parsed.imageAssociations["Legacy.jpg"]?.[0], "legacy");
    assert.doesNotMatch(output, /Optional Article Suggestions|Department Heads|Chef's Corner|Vitality/);
    assert.equal(parsed.birthdayPresent, false);
    const runArticles = service.porterParseToArticles(parsed);
    assert.equal(runArticles.length, 8);
    assert.equal(runArticles.some((article) => /\.docx$/i.test(article.title)), false);
    assert.equal(runArticles.some((article) => article.title === "Happy Hours"), true);
    assert.equal(runArticles.some((article) => /7\/31 Dog Days of Summer/.test(article.body)), true);
  });
} else {
  test("real July submission fixture is supplied in the demo workspace", { skip: "real submission asset is not present in this checkout" }, () => {});
}
