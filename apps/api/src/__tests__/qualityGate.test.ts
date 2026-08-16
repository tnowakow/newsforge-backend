import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_QUALITY_GATE_FLOOR,
  evaluateQualityGate,
  resolveQualityGateFloor,
} from "../services/qualityGate.js";

describe("resolveQualityGateFloor", () => {
  it("defaults to 0.6 when env is unset", () => {
    assert.equal(resolveQualityGateFloor({}), DEFAULT_QUALITY_GATE_FLOOR);
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "" }),
      0.6,
    );
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "   " }),
      0.6,
    );
  });

  it("parses valid values (0–1)", () => {
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "0.75" }),
      0.75,
    );
    assert.equal(resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "0" }), 0);
    assert.equal(resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "1" }), 1);
  });

  it("falls back to default on invalid or out-of-range values", () => {
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "abc" }),
      0.6,
    );
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "1.5" }),
      0.6,
    );
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "-0.2" }),
      0.6,
    );
    assert.equal(
      resolveQualityGateFloor({ NEWSFORGE_QUALITY_GATE_FLOOR: "NaN" }),
      0.6,
    );
  });
});

describe("evaluateQualityGate", () => {
  it("passes at and above the floor", () => {
    assert.equal(evaluateQualityGate(0.6, 0.6).passed, true);
    const g = evaluateQualityGate(0.808, 0.6);
    assert.equal(g.passed, true);
    assert.equal(g.floor, 0.6);
    assert.equal(g.finalScore, 0.808);
    assert.match(g.reason, /meets/);
  });

  it("fails below the floor (Tom's 29.5% Trilogy run)", () => {
    const g = evaluateQualityGate(0.295, 0.6);
    assert.equal(g.passed, false);
    assert.equal(g.finalScore, 0.295);
    assert.equal(g.floor, 0.6);
    assert.match(g.reason, /below/);
  });

  it("clamps out-of-range scores and floors", () => {
    assert.equal(evaluateQualityGate(1.5, 0.6).finalScore, 1);
    assert.equal(evaluateQualityGate(-1, 0.6).finalScore, 0);
    assert.equal(evaluateQualityGate(NaN, 0.6).passed, false);
    assert.equal(evaluateQualityGate(0.7, 1.5).floor, 1);
    assert.equal(evaluateQualityGate(0.5, NaN).floor, 0.6);
  });
});
