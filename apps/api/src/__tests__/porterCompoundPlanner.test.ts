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

/** Image whose metadata is deliberately opaque: no usable text caption. */
function opaqueImage(id: string, originalName: string): NewsImage {
  return {
    id,
    url: `/uploads/photo-${id}.jpg`,
    aspect: "landscape",
    source: "UPLOAD",
    isPlaceholder: false,
    originalName,
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

  it("records a decision for every article and photo; rejections carry a stored reason (TRI-R04 item 4)", () => {
    const articles = baseArticles();
    const images = baseImages();
    const layout = build(articles, images);

    const decisions = layout.assetDecisions ?? [];
    assert.ok(decisions.length > 0, "assetDecisions must be present");
    const byAsset = new Map(decisions.map((decision) => [decision.assetId, decision]));

    for (const article of articles) {
      const decision = byAsset.get(article.id);
      assert.ok(decision, `article ${article.id} has a decision record`);
      if (decision.outcome === "placed") {
        assert.ok(decision.page === 1 || decision.page === 2, "placed article records its page");
      } else {
        assert.ok(decision.reason && decision.reason.trim().length > 0, `rejected article ${article.id} carries a stored reason`);
        assert.ok(decision.decisionCode, "rejected article carries a decisionCode");
      }
    }
    for (const image of images) {
      const decision = byAsset.get(image.id);
      assert.ok(decision, `photo ${image.id} has a decision record`);
      if (decision.outcome === "placed") {
        assert.ok(decision.page === 1 || decision.page === 2, "placed photo records its page");
      } else {
        assert.ok(decision.reason && decision.reason.trim().length > 0, `rejected photo ${image.id} carries a stored reason`);
      }
    }
  });

  it("changing an operator alias changes the paired final image and caption (TRI-R04b3 acceptance)", () => {
    // 'Outings 2.jpg' has no uploaded exact photo: the operator must alias it.
    // The exact 'Outings 1.jpg' upload is opaque (no usable caption text), so
    // the article title is the only caption the planner can fall back to.
    const outing = opaqueImage("outings-a", "Outings 1.jpg");
    // Alias targets are uploads no other article references by name.
    const targetOne = { ...opaqueImage("alias-one", "campus-one.jpg"), caption: "Tea Club at the table" };
    const targetTwo = opaqueImage("alias-two", "campus-two.jpg");
    const images = [
      image("director-img", "Director Portrait.jpg"),
      outing,
      image("wings-a", "Wings of Joy 1.jpg"),
      image("wings-b", "Wings of Joy 2.jpg"),
      image("breakfast-a", "Mens Breakfast 1.jpg"),
      image("breakfast-b", "Mens Breakfast 2.jpg"),
      image("tea-a", "Mothers Tea 1.jpg"),
      image("tea-b", "Mothers Tea 2.jpg"),
    ];
    const articlesFor = (aliasValue: string) => [
      article("birthday", "Milestone List", "RESIDENTS\nJerry L. 7/8\nSTAFF\nCarla M. 7/3", "birthday-roster", [], 0, "birthday"),
      article("director", "Campus Leader Note", "A warm note from the campus leader about the month ahead.", "director-note", ["Director Portrait.jpg"], 1, "executive-note"),
      {
        ...article("outings", "Community Trips", "Residents enjoyed time together around town.", "narrative-story", ["Outings 1.jpg", "Outings 2.jpg"], 2),
        operatorAliases: { "Outings 2.jpg": aliasValue },
      },
      article("wings", "Creative Partnership", "Residents and students worked together on a colorful project.", "narrative-story", ["Wings of Joy 1.jpg", "Wings of Joy 2.jpg"], 3),
      article("breakfast", "Morning Gathering", "Neighbors gathered for breakfast and conversation.", "narrative-story", ["Mens Breakfast 1.jpg", "Mens Breakfast 2.jpg"], 4),
      article("tea", "Tea Celebration", "The community honored mothers and motherly figures.", "narrative-story", ["Mothers Tea 1.jpg", "Mothers Tea 2.jpg"], 5),
      article("events", "Community Calendar", Array.from({ length: 12 }, (_, index) => `7/${index + 1} Event ${index + 1}`).join("\n"), "dated-list", [], 6),
    ];

    // Save 1: the operator aliases 'Outings 2.jpg' to a photo that carries
    // its own supplied caption.
    const layoutOne = buildPorterCompoundLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec,
      articles: articlesFor(targetOne.id),
      images: [...images, targetOne],
    });
    // Save 2: same packet, alias changed to a different photo whose metadata
    // carries no usable caption — the fallback must be the story title.
    const layoutTwo = buildPorterCompoundLayout({
      templateId: "v3-upload-source",
      pageCount: 2,
      gridSpec,
      articles: articlesFor(targetTwo.id),
      images: [...images, targetTwo],
    });
    assert.ok(layoutOne, "expected compound layout for alias one");
    assert.ok(layoutTwo, "expected compound layout for alias two");

    const outingsBlocks = (layout: NonNullable<typeof layoutOne>) =>
      layout.blocks.filter((block) => block.compoundId === "compound-outings" && block.imageId);
    const outingsPhotosOne = outingsBlocks(layoutOne).map((block) => block.imageId).sort();
    const outingsPhotosTwo = outingsBlocks(layoutTwo).map((block) => block.imageId).sort();
    const captionsOne = outingsBlocks(layoutOne).map((block) => block.caption);
    const captionsTwo = outingsBlocks(layoutTwo).map((block) => block.caption);

    // The alias drives which photo the paired story receives.
    assert.deepEqual(outingsPhotosOne, [outing.id, targetOne.id].sort(), "alias target paired with the outings story");
    assert.deepEqual(outingsPhotosTwo, [outing.id, targetTwo.id].sort(), "changed alias target paired with the outings story");
    assert.notDeepEqual(outingsPhotosOne, outingsPhotosTwo, "changing the alias must change the paired final image");

    // …and the paired block's caption follows the new asset: the photo with a
    // real caption keeps it; the opaque photo falls back to the story title;
    // and one save's caption never leaks into the other pairing.
    const teaCaption = "Tea Club at the table";
    assert.deepEqual([...captionsOne].sort(), ["Community Trips", teaCaption].sort(), `alias-one captions ${JSON.stringify(captionsOne)}`);
    assert.deepEqual([...captionsTwo].sort(), ["Community Trips", "Community Trips"], `alias-two captions ${JSON.stringify(captionsTwo)}`);
    assert.ok(!captionsTwo.includes(teaCaption), "previous alias target's caption must not follow the old pairing");
  });

  it("resolves 'Photo 1.jpg' and 'Photo 10.jpg' to distinct exact photos — no normalization collision (TRI-R04 acceptance)", () => {
    // Regression: prefix/substring matching used to let a ref for 'Photo 1'
    // also claim 'Photo 10', stealing an exact match from its real owner.
    const articles: Article[] = [
      { ...article("roster", "Happy Birthday!", "RESIDENTS\nJerry L. 7/8\nMichael J. 7/12\nSTAFF\nCarla M. 7/3", "birthday-roster", [], 0) },
      { ...article("note", "Executive Director Corner", "A letter from the executive director about the month ahead and the team's work.", "director-note", [], 1) },
      { ...article("story1", "Legacy News", "Residents shared a lively afternoon together with old friends from across the neighborhood.", "narrative-story", ["Photo 1.jpg"], 2) },
      { ...article("story10", "Anniversary Celebration", "The community marked a milestone year with music and a shared lunch on the lawn.", "narrative-story", ["Photo 10.jpg"], 3) },
      { ...article("story2", "Chef Circle", "Chef Circle brought residents together for a hands-on culinary gathering with the dining team.", "narrative-story", [], 4) },
      { ...article("rail", "Upcoming Events", ["7/1 Music", "7/2 Brunch", "7/3 Happy Hour", "7/9 Picnic", "7/10 Happy Hour", "7/14 Cruise", "7/15 Karaoke", "7/17 Happy Hour"].join("\n"), "dated-list", [], 5) },
    ];
    const images: NewsImage[] = [
      { ...image("p1", "Photo 1.jpg"), originalName: "Photo 1.jpg" },
      { ...image("p10", "Photo 10.jpg"), originalName: "Photo 10.jpg" },
      { ...image("p2", "Photo 2.jpg"), originalName: "Photo 2.jpg" },
    ];

    const layout = build(articles, images);
    const story1Photos = layout.blocks.filter((block) => block.imageId && (articles.find((a) => a.id === "story1")!.imageRefs ?? []).some((ref) => ref === images.find((i) => i.id === block.imageId)?.caption)).map((block) => block.imageId);
    const story10Photos = layout.blocks.filter((block) => block.imageId && (articles.find((a) => a.id === "story10")!.imageRefs ?? []).some((ref) => ref === images.find((i) => i.id === block.imageId)?.caption)).map((block) => block.imageId);

    assert.ok(story1Photos.includes("p1"), "story1 keeps its exact 'Photo 1.jpg' match");
    assert.ok(!story1Photos.includes("p10"), "'Photo 1.jpg' must not resolve to 'Photo 10.jpg'");
    assert.ok(story10Photos.includes("p10"), "story10 keeps its exact 'Photo 10.jpg' match");
    assert.ok(!story10Photos.includes("p1"), "'Photo 10.jpg' must not steal 'Photo 1.jpg'");
    // Neither story borrows the other's exact photo to fill a slot.
    const p1Owner = layout.blocks.find((block) => block.imageId === "p1");
    const p10Owner = layout.blocks.find((block) => block.imageId === "p10");
    assert.equal(p1Owner?.compoundId, "compound-story1");
    assert.equal(p10Owner?.compoundId, "compound-story10");
  });
});
