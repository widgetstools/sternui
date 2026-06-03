/**
 * pickDistinctIndices — choose `count` distinct array indices in `[0, length)`.
 *
 * Used by the live-update loop to mutate a batch of distinct rows per tick
 * (so a single frame carries N different positions/trades rather than one).
 *
 * Strategy: when `count >= length` we return every index; otherwise we use
 * rejection sampling against a Set. The live path always picks far fewer
 * rows than the snapshot size (e.g. 100 of 20,000), so expected retries are
 * negligible. `rng` is injectable for deterministic tests.
 */
export function pickDistinctIndices(
  count: number,
  length: number,
  rng: () => number = Math.random,
): number[] {
  if (length <= 0 || count <= 0) return [];
  if (count >= length) return Array.from({ length }, (_, i) => i);

  const picked = new Set<number>();
  while (picked.size < count) {
    picked.add(Math.floor(rng() * length));
  }
  return [...picked];
}
