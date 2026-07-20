/** Deterministic PRNG for reproducible “real-world-like” datasets. */
export function createRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Powers of ten for arithmetic rounding — `toFixed` (string round-trip) was
 * the snapshot generator's hot spot: ~250 calls/row × 20k rows ≈ 5M string
 * allocations, several SECONDS per snapshot build. */
const POW10 = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000];

export function randBetween(
  rng: () => number,
  min: number,
  max: number,
  decimals: number | null = 2,
): number {
  const v = rng() * (max - min) + min;
  if (decimals === null) return v;
  const p = POW10[decimals] ?? 10 ** decimals;
  return Math.round(v * p) / p;
}

export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
