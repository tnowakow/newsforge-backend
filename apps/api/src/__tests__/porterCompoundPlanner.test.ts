import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Article, GridSpec, LayoutBlock, NewsImage } from "@newsforge/shared/schemas";
import { buildPorterCompoundLayout } from "../services/porterCompoundPlanner.js";
import { evaluatePorterLayoutInvariants } from "../services/porterLayoutInvariants.js";
import { porterBlocksAreAdjacent } from "../services/porterSourceSemantics.js";

const gridSpec: GridSpec = {
  label: "porter-compound",
  columns: 24,
  rowsPerPage: 16,
  slots: [],
};

function article(
  id: string,
  title: string,
  body: string,
  sourceRole: Article["sourceRole"],
  imageRefs: string[] = [],
  sourceOrder = 0,
  articleType: Article["articleType"] = "other",
): Article {
  return {
    id,
    title,
    body,
    imageRefs,
    wordCount: body.split(/\s+/).filter(Boolean).length,
    source: "UPLOAD",
    sourceRole,
    sourceOrder,
    compoundId: `compound-${id}`,
    articleType,
    isFiller: false,
  };
}

function image(id: string, caption: string): NewsImage {
  return {
    id,
    url: `/uploads/${caption}`,
    caption,
    aspect: /portrait|director/i.test(caption) ? "portrait" : "landscape",
    source: "UPLOAD",
    isPlaceholder: false,
  };
}

function baseArticles(eventRows = 12): Article[] {
  return [
    article("birthday", "Milestone List", "RESIDENTS\nJerry L. 7/8\nSTAFF\nCarla M. 7/3", "birthday-roster", [], 0, "birthday"),
    article("director", "Campus Leader Note", "A warm note from the campus leader about the month ahead.", "director-note", ["Director Portrait.jpg"], 1, "executive-note"),
    article("outings", "Community Trips", "Residents enjoyed time together around town.", "narrative-story", ["Outings 1.jpg", "Outings 2.jpg"], 2),
    article("wings", "Creative Partnership", "Residents and students worked together on a colorful project.", "narrative-story", ["Wings 1.jpg", "Wings 2.jpg"], 3),
    article("breakfast", "Morning Gathering", "Neighbors gathered for breakfast and conversation.", "narrative-story", ["Breakfast 1.jpg", "Breakfast 2.jpg"], 4),
    article("mothers", "Tea Celebration", "The community honored mothers and motherly figures.", "narrative-story", ["Tea 1.jpg", "Tea 2.jpg"], 5),
    article(
      "events",
      "Community Calendar",
      Array.from({ length: eventRows }, (_, index) => `7/${index + 1} Event ${index + 1}`).join("\n"),
      "dated-list",
      [],
      6,
    ),
  ];
}

function baseImages(): NewsImage[] {
  return [
    image("director-img", "Director Portrait.jpg"),
    image("outings-a", "Outings 1.jpg"),
    image("outings-b", "Outings 2.jpg"),
    image("wings-a", "Wings 1.jpg"),
    image("wings-b", "Wings 2.jpg"),
    image("breakfast-a", "Breakfast 1.jpg"),
    image("breakfast-b", "Breakfast 2.jpg"),
    image("tea-a", "Tea 1.jpg"),
    image("tea-b", "Tea 2.jpg"),
    image("extra-a", "Campus Moment 1.jpg"),
    image("extra-b", "Campus Moment 2.jpg"),
  ];
}

function build(articles = baseArticles(), images = baseImages()) {
  const layout = buildPorterCompoundLayout({
    templateId: "v3-upload-source",
    pageCount: 2,
    gridSpec,
    articles,
    images,
  });
  assert.ok(layout, "expected compound layout");
  return layout;
}

function blockFor(blocks: LayoutBlock[], articleId: string): LayoutBlock {
  const block = blocks.find((candidate) => candidate.articleId === articleId || candidate.slotId === `source-${articleId}`);
  assert.ok(block, `expected ${articleId} block`);
  return block;
}

describe("porterCompoundPlanner", () => {
  it("packs semantic source units into rails and adjacent story/photo compounds", () => {
    const articles = baseArticles();
    const images = baseImages();
    const layout = build(articles, images);
    const blocks = layout.blocks;

    assert.equal(new Set(blocks.filter((block) => block.imageId).map((block) => block.imageId)).size, images.length);
    assert.equal(blockFor(blocks, "birthday").style?.panelRole, "birthday");
    assert.equal(blockFor(blocks, "events").style?.panelRole, "upcomingEvents");
    assert.equal(blockFor(blocks, "events").position.rowSpan, 16);
    assert.equal(blockFor(blocks, "director").style?.panelRole, "directorCorner");

    for (const article of articles.filter((candidate) => (candidate.imageRefs ?? []).length > 0)) {
      const story = blockFor(blocks, article.id);
      const matchedPhotos = blocks.filter((block) =>
        block.imageId &&
        images.some((candidate) =>
          candidate.id === block.imageId &&
          (article.imageRefs ?? []).some((ref) => candidate.caption === ref),
        ),
      );
      assert.ok(matchedPhotos.some((photo) => porterBlocksAreAdjacent(story, photo)), `${article.id} should have an adjacent matched photo`);
    }

    const invariants = evaluatePorterLayoutInvariants({ layout, articles, images });
    assert.equal(invariants.passed, true);
  });

  it("uses sourceRole and sourceOrder rather than fragile section names or input order", () => {
    const renamed = baseArticles().map((item, index) => ({
      ...item,
      title: `Renamed Section ${index}`,
    })).reverse();
    const layout = build(renamed, baseImages());

    assert.equal(blockFor(layout.blocks, "director").sourceOrder, 1);
    assert.equal(blockFor(layout.blocks, "events").sourceOrder, 6);
    assert.equal(blockFor(layout.blocks, "events").position.rowSpan, 16);
  });

  it("allocates long-list rails monotonically as row counts grow", () => {
    const railArea = (rows: number) => {
      const layout = build(baseArticles(rows), baseImages());
      const eventRail = blockFor(layout.blocks, "events");
      assert.equal(eventRail.listItems?.length, rows);
      return eventRail.position.colSpan * eventRail.position.rowSpan;
    };

    assert.ok(railArea(12) >= railArea(8));
    assert.ok(railArea(20) >= railArea(12));
  });

  it("rejects a compound candidate rather than silently dropping a required source story", () => {
    const crowded = [
      ...baseArticles(),
      ...Array.from({ length: 4 }, (_, index) => article(
        `extra-story-${index + 1}`,
        `Extra Community Story ${index + 1}`,
        "A full story that must not disappear from the uploaded packet.",
        "narrative-story",
        [],
        index + 7,
      )),
    ];
    const layout = buildPorterCompoundLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec,
      articles: crowded,
      images: baseImages(),
    });
    assert.equal(layout, undefined);
  });
});
