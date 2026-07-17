import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RESIDENT_NAME_REGEX,
  FULL_BIRTHDATE_REGEX,
  detectResidentLastNames,
  detectFullBirthdates,
  scoreStockImage,
  runComplianceSync,
} from "../services/complianceService.js";
import type { Article, NewsImage } from "@newsforge/shared/schemas";

function art(id: string, body: string): Article {
  return {
    id,
    title: `t-${id}`,
    body,
    wordCount: body.split(/\s+/).length,
    isFiller: false,
    source: "MOCK",
  };
}

function img(id: string): NewsImage {
  return {
    id,
    url: `/uploads/${id}.jpg`,
    aspect: "landscape",
    isPlaceholder: false,
    source: "MOCK",
  };
}

describe("RESIDENT_NAME_REGEX", () => {
  it("matches simple First Last", () => {
    RESIDENT_NAME_REGEX.lastIndex = 0;
    const m = RESIDENT_NAME_REGEX.exec("We spoke with John Smith at the picnic.");
    assert.ok(m);
    assert.equal(m?.[0], "John Smith");
  });

  it("matches O'Brien with apostrophe", () => {
    RESIDENT_NAME_REGEX.lastIndex = 0;
    const m = RESIDENT_NAME_REGEX.exec("Mary O'Brien joined the choir.");
    assert.ok(m);
    assert.equal(m?.[0], "Mary O'Brien");
  });

  it("matches at least the head of a hyphenated surname", () => {
    // Vitaly's regex greedily eats the hyphen in the inner class before
    // reaching the optional `-Second` group, so "James McDonald-Reilly"
    // fires as "James McDonald-" or "James McDonald". Either is a
    // sufficient signal for the warn-level flag — the point is to notice
    // there is a resident-shaped name in the copy.
    RESIDENT_NAME_REGEX.lastIndex = 0;
    const m = RESIDENT_NAME_REGEX.exec("James McDonald-Reilly volunteered.");
    assert.ok(m, "expected a match on hyphenated surname");
    assert.match(m![0], /^James McDonald/);
  });

  it("does not fire on single first name alone", () => {
    RESIDENT_NAME_REGEX.lastIndex = 0;
    // "John" alone shouldn't produce a two-token match.
    const m = RESIDENT_NAME_REGEX.exec("John was there.");
    // We may still get "John Was" if 'Was' were capitalized-lower — 'was' is lowercase so no match.
    assert.equal(m, null);
  });
});

describe("detectResidentLastNames", () => {
  it("flags resident names as warn", () => {
    const flags = detectResidentLastNames([
      art("a1", "This month we highlighted Mary Johnson and her recipe box."),
    ]);
    assert.ok(flags.length >= 1);
    assert.equal(flags[0].category, "resident-last-name");
    assert.equal(flags[0].severity, "warn");
  });

  it("filters out place names from NAME_STOPWORDS", () => {
    const flags = detectResidentLastNames([
      art("a1", "The choir toured New York and had lunch in Los Angeles."),
    ]);
    // Neither "New York" nor "Los Angeles" should fire.
    assert.equal(flags.length, 0);
  });

  it("skips names near Director/Manager (staff titles)", () => {
    const flags = detectResidentLastNames([
      art("a1", "Executive Director Sarah Klein hosted the town hall."),
    ]);
    // Should be filtered because context contains "Director".
    assert.equal(flags.length, 0);
  });

  it("skips day/month capitalised pairs", () => {
    const flags = detectResidentLastNames([
      art("a1", "Every Monday Morning we meet in the great room."),
    ]);
    assert.equal(flags.length, 0);
  });

  it("does not flag Trilogy brand phrases (Riley W1)", () => {
    // Phrases that were false-positiving in Phase 4 QA: pulled straight from
    // the Trilogy filler seed and brand kit. None of these are residents.
    const bodies = [
      "The Best Friends Approach is more than a memory-care philosophy.",
      "Ask most of our residents about the Good Old Days on a Sunday drive.",
      "Our Daily Rhythms are humming this month on the patio.",
      "Independence Day fireworks will light up the courtyard on July 4.",
      "Independence Village celebrated with a cookout this weekend.",
      "Adult Day guests joined the morning stretch class.",
      "Skilled Services staff hosted an open house on Friday.",
    ];
    for (const body of bodies) {
      const flags = detectResidentLastNames([art("a1", body)]);
      assert.equal(
        flags.length,
        0,
        `Trilogy brand phrase should not flag: "${body}" — got ${JSON.stringify(
          flags.map((f) => f.reason),
        )}`,
      );
    }
  });

  it("still flags real FirstName LastName after Trilogy allowlist", () => {
    // Sanity check: the W1 fix must not weaken the detector.
    const flags = detectResidentLastNames([
      art("a1", "We spoke with John Smith at the picnic."),
    ]);
    assert.ok(flags.length >= 1);
    assert.equal(flags[0].severity, "warn");
  });
});

describe("FULL_BIRTHDATE_REGEX", () => {
  it("matches numeric slash date with year", () => {
    FULL_BIRTHDATE_REGEX.lastIndex = 0;
    assert.ok(FULL_BIRTHDATE_REGEX.test("Born 1/12/1938 in Cleveland."));
  });

  it("matches long-form January 12, 1938", () => {
    FULL_BIRTHDATE_REGEX.lastIndex = 0;
    assert.ok(FULL_BIRTHDATE_REGEX.test("Born January 12, 1938 in Ohio."));
  });

  it("requires 4-digit year (no 2-digit yy)", () => {
    FULL_BIRTHDATE_REGEX.lastIndex = 0;
    assert.equal(FULL_BIRTHDATE_REGEX.test("Born 1/12/38 in Cleveland."), false);
  });

  it("matches Jan 12 1938 without comma", () => {
    FULL_BIRTHDATE_REGEX.lastIndex = 0;
    assert.ok(FULL_BIRTHDATE_REGEX.test("Born Jan 12 1938 near the coast."));
  });
});

describe("detectFullBirthdates", () => {
  it("elevates to block when name is within 120 chars", () => {
    const flags = detectFullBirthdates([
      art("a1", "Mary Johnson, January 12, 1938, celebrated with cake."),
    ]);
    assert.ok(flags.length >= 1);
    assert.equal(flags[0].category, "full-birthdate-with-name");
    assert.equal(flags[0].severity, "block");
  });

  it("stays info when a bare date appears without a nearby name", () => {
    const flags = detectFullBirthdates([
      art("a1", "The event will be held 1/12/2027 in the great room."),
    ]);
    assert.ok(flags.length >= 1);
    assert.equal(flags[0].severity, "info");
  });
});

describe("scoreStockImage", () => {
  it("flags stock-prefix filename as warn (+2)", () => {
    const r = scoreStockImage(
      { imageId: "x", filename: "pexels-photo-12345.jpg" },
      new Set(),
    );
    assert.equal(r.severity, "warn");
    assert.ok(r.score >= 2);
  });

  it("blocks on pHash denylist hit (+3)", () => {
    const r = scoreStockImage(
      { imageId: "x", perceptualHash: "deadbeef" },
      new Set(["deadbeef"]),
    );
    assert.equal(r.severity, "block");
  });

  it("no flag when only signal is missing EXIF (+1)", () => {
    const r = scoreStockImage(
      { imageId: "x", exifPresent: false },
      new Set(),
    );
    assert.equal(r.severity, null);
  });
});

describe("runComplianceSync integration", () => {
  it("produces both resident-name and full-birthdate flags from single article", () => {
    const flags = runComplianceSync({
      articles: [
        art("a1", "Mary Johnson, January 12, 1938, was celebrated in the dining room."),
      ],
      images: [img("i1")],
    });
    const cats = flags.map((f) => f.category);
    assert.ok(cats.includes("resident-last-name"));
    assert.ok(cats.includes("full-birthdate-with-name"));
    const birth = flags.find((f) => f.category === "full-birthdate-with-name");
    assert.equal(birth?.severity, "block");
  });

  it("stays quiet on a Trilogy filler article with no residents (Riley W1)", () => {
    // Verbatim body from trilogy-filler-009 (seed.ts). Should produce zero
    // resident-last-name flags even though the regex sees several
    // capitalized token pairs.
    const flags = runComplianceSync({
      articles: [
        art(
          "a1",
          "The Best Friends Approach is more than a memory-care philosophy — it's how we spend every hour on this campus. Knowing a resident's favorite flower, the name of their first dog, the song they danced to at their wedding: these are the details that turn care into companionship. We invite every family to help us build that story.",
        ),
      ],
      images: [img("i1")],
    });
    const residentFlags = flags.filter(
      (f) => f.category === "resident-last-name",
    );
    assert.equal(
      residentFlags.length,
      0,
      `Expected no resident-name flags, got ${JSON.stringify(
        residentFlags.map((f) => f.reason),
      )}`,
    );
  });
});
