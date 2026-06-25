import crypto from "node:crypto";

/**
 * Mulberry32 PRNG seeded from a hash. Vitaly §6.4:
 * mock content for the same (clientId, monthLabel) MUST be identical.
 */
export function makeRng(seedString: string): () => number {
  const hash = crypto.createHash("sha256").update(seedString).digest();
  let state =
    ((hash[0]! << 24) >>> 0) +
    ((hash[1]! << 16) >>> 0) +
    ((hash[2]! << 8) >>> 0) +
    (hash[3]! >>> 0);
  return function rng(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error("pick: empty array");
  return arr[Math.floor(rng() * arr.length)]!;
}

export function range(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
