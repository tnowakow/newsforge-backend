/**
 * qualityGate — the ship floor for NewsForge output.
 *
 * A newsletter scoring below the floor must never be exported silently.
 * The gate blocks the PDF endpoint (409 `quality_gate_blocked`) unless the
 * caller passes force (body `force: true` or `?force=1`) — force stays
 * available so the operator can compare bad output, but it can never be
 * silent.
 *
 * Pure functions; unit-testable in isolation.
 * Floor: default 0.6, env override NEWSFORGE_QUALITY_GATE_FLOOR (0–1).
 * See V3-QUALITY-GATE-FIX-PLAN.md (fix #1).
 */
import type { QualityGateReport } from "@newsforge/shared/schemas";

export const DEFAULT_QUALITY_GATE_FLOOR = 0.6;

/**
 * Resolve the ship floor from env. Missing / invalid / out-of-range → default.
 */
export function resolveQualityGateFloor(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.NEWSFORGE_QUALITY_GATE_FLOOR;
  if (raw == null || String(raw).trim() === "") {
    return DEFAULT_QUALITY_GATE_FLOOR;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_QUALITY_GATE_FLOOR;
  }
  return parsed;
}

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

const pct = (n: number): string => `${Math.round(n * 1000) / 10}%`;

/**
 * Evaluate the ship floor against a final (0–1) score.
 */
export function evaluateQualityGate(
  finalScore: number,
  floor: number = resolveQualityGateFloor(),
  hardFailures: string[] = [],
): QualityGateReport {
  const safeFloor = Number.isFinite(floor)
    ? Math.min(1, Math.max(0, floor))
    : DEFAULT_QUALITY_GATE_FLOOR;
  const safeScore = clamp01(finalScore);
  const failures = hardFailures.filter(Boolean);
  const passed = safeScore >= safeFloor && failures.length === 0;
  return {
    floor: safeFloor,
    finalScore: safeScore,
    passed,
    hardFailures: failures.length > 0 ? failures : undefined,
    reason: failures.length > 0
      ? `Hard Porter invariant failed — export blocked until forced. ${failures[0]}`
      : passed
        ? `Final score ${pct(safeScore)} meets the ${pct(safeFloor)} ship floor.`
        : `Final score ${pct(safeScore)} is below the ${pct(safeFloor)} ship floor — export blocked until forced.`,
  };
}
