import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateMockContent, type MockScenario } from "../services/mockContent.js";

const baseInput = {
  richness: "RICH" as const,
  careLevel: "MIXED" as const,
  brandVoice: "Warm, colorful, community-focused",
  clientName: "Trilogy Health Services",
  city: "Cincinnati",
  monthLabel: "July 2026",
};

function trilogyScenario(scenario: MockScenario, density = 3) {
  return generateMockContent({
    ...baseInput,
    scenario,
    density,
    include: ["director", "spotlight", "events", "menu", "opEd"],
  });
}

describe("mockContent Trilogy scenarios", () => {
  it("gives demo scenarios different lead story DNA", () => {
    const classic = trilogyScenario("community-classic");
    const photo = trilogyScenario("photo-festival", 4);
    const resident = trilogyScenario("resident-feature");
    const editorial = trilogyScenario("editorial-light", 1);

    assert.equal(classic.articles[0].title, "Happy Birthday!");
    assert.equal(photo.articles[0].title, "Out and About");
    assert.equal(resident.articles[0].title, "Smile of the Month");
    assert.equal(editorial.articles[0].title, "Executive Director Corner");
    assert.equal(editorial.articles[1].title, "Happy Birthday!");
    assert.notDeepEqual(
      classic.articles.slice(0, 5).map((article) => article.title),
      photo.articles.slice(0, 5).map((article) => article.title),
    );
  });

  it("uses scenario-specific photo volume and ordering", () => {
    const photo = trilogyScenario("photo-festival", 4);
    const editorial = trilogyScenario("editorial-light", 1);

    assert.ok(photo.images.length >= 12);
    assert.ok(editorial.images.length <= 4);
    assert.notEqual(photo.images[0].caption, editorial.images[0].caption);
  });

  it("honors include controls for Trilogy instead of always walking the same list", () => {
    const spotlightOnly = generateMockContent({
      ...baseInput,
      scenario: "resident-feature",
      density: 2,
      include: ["spotlight"],
    });

    const titles = spotlightOnly.articles.map((article) => article.title);
    assert.ok(titles.includes("Smile of the Month"));
    assert.ok(titles.includes("The Best Friends Approach in Action"));
    assert.equal(titles.includes("Happy Hour"), false);
    assert.equal(titles.includes("Executive Director Corner"), false);
  });
});
