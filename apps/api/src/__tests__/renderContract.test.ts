import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LETTER_RENDER_CONTRACT,
  RenderContractSchema,
  contractCss,
  contractRoleCss,
  inchesToCssPx,
} from "@newsforge/shared";

describe("letter render contract", () => {
  it("meets the measured Trilogy/Porter geometry", () => {
    const c = LETTER_RENDER_CONTRACT;
    assert.equal(c.id, "letter-inner-v1");
    assert.equal(c.page.widthIn, 8.5);
    assert.equal(c.page.heightIn, 11);
    assert.equal(c.marginsIn.top, 0.34);
    assert.equal(c.marginsIn.right, 0.34);
    assert.equal(c.marginsIn.bottom, 0.4);
    assert.equal(c.marginsIn.left, 0.34);
    assert.equal(c.gutterPx, 4);
    assert.equal(c.fonts.heading, "Source Sans 3");
    assert.equal(c.fonts.body, "EB Garamond");
    // TRI-R06: body size measured from Porter references (AGaramondPro-Regular 11.5pt),
    // not the legacy 10.5pt Georgia baseline.
    assert.equal(c.type.bodyPt, 11.5);
    assert.equal(c.type.captionPt, 9);
    // TRI-R06: per-role typography (measured values, not uniform scaling).
    assert.equal(c.roles.body.pt, 11.5);
    assert.equal(c.roles.display.pt, 23);
    assert.equal(c.roles.display.weight, 900);
    assert.equal(c.roles.caption.pt, 9);
    assert.equal(c.roles.heading.pt, 15);
    // TRI-R06: explicit font availability — no silent FreeSerif substitution.
    assert.equal(c.fontAvailability.strict, true);
    assert.ok(c.fontAvailability.required.includes("EB Garamond"));
    assert.ok(c.fontAvailability.required.includes("Source Sans 3"));
    assert.ok(!c.fontAvailability.required.some((f) => /FreeSerif/i.test(f)));
    assert.ok(!c.roles.body.fontStack.includes("FreeSerif"));
    assert.ok(!c.roles.display.fontStack.includes("FreeSerif"));
    assert.ok(c.fontAvailability.substitutions.length === 2);
    assert.ok(c.fontAvailability.inRepoAssets.length === 2);
    // TRI-R06: column / measure rules.
    assert.equal(c.columns.count, 12);
    assert.equal(c.columns.maxMeasureChars, 66);
    assert.equal(c.readable, true);
  });

  it("emits the measured geometry + per-role CSS (verifiable in rendered output)", () => {
    assert.equal(inchesToCssPx(8.5), 816);
    assert.equal(inchesToCssPx(11), 1056);
    assert.match(contractCss(LETTER_RENDER_CONTRACT), /width:8\.5in;height:11in/);
    assert.match(contractCss(LETTER_RENDER_CONTRACT), /padding:0\.34in 0\.34in 0\.4in 0\.34in/);
    const roleCss = contractRoleCss(LETTER_RENDER_CONTRACT);
    assert.match(roleCss, /--role-body-pt:11\.5pt/);
    assert.match(roleCss, /--role-display-pt:23pt/);
    assert.match(roleCss, /--role-display-font:"Source Sans 3"/);
    assert.match(roleCss, /--role-body-font:"EB Garamond"/);
    assert.match(roleCss, /\.render-contract \.body/);
    assert.match(roleCss, /font-weight: var\(--role-display-weight\)/);
  });

  it("rejects the legacy tiny body floor", () => {
    const result = RenderContractSchema.safeParse({
      ...LETTER_RENDER_CONTRACT,
      type: { ...LETTER_RENDER_CONTRACT.type, bodyPt: 7.65 },
    });
    assert.equal(result.success, false);
  });

  it("rejects a contract that omits explicit font availability", () => {
    const result = RenderContractSchema.safeParse({
      ...LETTER_RENDER_CONTRACT,
      fontAvailability: undefined,
    });
    assert.equal(result.success, false);
  });
});
