import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LETTER_RENDER_CONTRACT, RenderContractSchema, contractCss, inchesToCssPx } from "@newsforge/shared";

describe("letter render contract", () => {
  it("declares measured Letter geometry and readable type floors", () => {
    assert.equal(RenderContractSchema.safeParse(LETTER_RENDER_CONTRACT).success, true);
    assert.equal(inchesToCssPx(8.5), 816);
    assert.equal(inchesToCssPx(11), 1056);
    assert.equal(LETTER_RENDER_CONTRACT.type.bodyPt, 10.5);
    assert.equal(LETTER_RENDER_CONTRACT.type.captionPt, 9);
    assert.match(contractCss(LETTER_RENDER_CONTRACT), /width:8\.5in;height:11in/);
  });

  it("rejects the legacy tiny body floor", () => {
    const result = RenderContractSchema.safeParse({
      ...LETTER_RENDER_CONTRACT,
      type: { ...LETTER_RENDER_CONTRACT.type, bodyPt: 7.65 },
    });
    assert.equal(result.success, false);
  });
});
