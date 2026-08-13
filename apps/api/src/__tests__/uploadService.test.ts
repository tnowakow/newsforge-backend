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
  assert.equal(parsed.articles.length, 5);
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
    "Chef Circle brings neighbors together for a shared meal",
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
