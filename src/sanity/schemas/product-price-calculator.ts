type RateMap = Partial<Record<string, number>>;

export function resolveEffectiveRate(
  rank: string,
  rates: RateMap,
  defaultRates: RateMap
): number | undefined {
  return rates[rank] ?? defaultRates[rank];
}

export function clampRate(value: number | undefined): number | undefined {
  if (value == null) return undefined;
  return Math.min(100, Math.max(0, value));
}

export function parseYen(raw: string): number | undefined {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") return undefined;
  return Number(digits);
}

export function computeRankPrices(
  retailPrice: number | undefined,
  rates: RateMap,
  defaultRates: RateMap
): RateMap {
  if (retailPrice == null) return {};

  const ranks = new Set([...Object.keys(rates), ...Object.keys(defaultRates)]);
  const result: RateMap = {};

  for (const rank of ranks) {
    const effectiveRate = resolveEffectiveRate(rank, rates, defaultRates);
    if (effectiveRate == null) continue;
    result[rank] = Math.round(retailPrice * (effectiveRate / 100));
  }

  return result;
}
