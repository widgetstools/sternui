export interface Bond {
  id: string;
  cusip: string;
  issuer: string;
  coupon: number;
  maturity: string;
  price: number;
  yield: number;
  currency: string;
  rating: string;
}

const ISSUERS = [
  "US Treasury",
  "Microsoft Corp",
  "Apple Inc",
  "Alphabet Inc",
  "Amazon.com Inc",
  "Berkshire Hathaway",
  "JPMorgan Chase",
  "Goldman Sachs",
  "Tesla Inc",
  "Meta Platforms",
];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY"];
const RATINGS = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB"];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function buildBondInventory(count: number, seed = 42): Bond[] {
  const r = rng(seed);
  const bonds: Bond[] = [];
  for (let i = 0; i < count; i++) {
    const issuer = ISSUERS[Math.floor(r() * ISSUERS.length)]!;
    const coupon = +(r() * 7).toFixed(3);
    const yearOffset = 1 + Math.floor(r() * 30);
    const maturity = `${2026 + yearOffset}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-15`;
    const price = +(85 + r() * 30).toFixed(3);
    const yld = +(coupon + (100 - price) * 0.04).toFixed(3);
    bonds.push({
      id: `BND-${String(i + 1).padStart(5, "0")}`,
      cusip: Array.from({ length: 9 }, () => Math.floor(r() * 36).toString(36).toUpperCase()).join(""),
      issuer,
      coupon,
      maturity,
      price,
      yield: yld,
      currency: CURRENCIES[Math.floor(r() * CURRENCIES.length)]!,
      rating: RATINGS[Math.floor(r() * RATINGS.length)]!,
    });
  }
  return bonds;
}
