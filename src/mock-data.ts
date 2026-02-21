import type {
  CartLineItem,
  CartOption,
  CartPlanInput,
  CartStrategy,
  RankedStoreQuote,
  SearchResultItem,
} from "../server";

type StoreProfile = {
  name: string;
  source: "api" | "scraped";
  sourceUrl: string;
  priceMultiplier: number;
  qualityBase: number;
  distanceMiles: number;
};

const STORE_PROFILES: StoreProfile[] = [
  {
    name: "Instacart Aggregated",
    source: "api",
    sourceUrl: "https://docs.instacart.com/developer_platform_api/",
    priceMultiplier: 1.0,
    qualityBase: 72,
    distanceMiles: 3.2,
  },
  {
    name: "Kroger",
    source: "api",
    sourceUrl: "https://developer.kroger.com/",
    priceMultiplier: 0.94,
    qualityBase: 75,
    distanceMiles: 4.1,
  },
  {
    name: "Safeway",
    source: "api",
    sourceUrl: "https://www.safeway.com/",
    priceMultiplier: 0.97,
    qualityBase: 73,
    distanceMiles: 4.9,
  },
  {
    name: "Target",
    source: "api",
    sourceUrl: "https://www.target.com/",
    priceMultiplier: 0.95,
    qualityBase: 74,
    distanceMiles: 5.1,
  },
  {
    name: "Whole Foods",
    source: "api",
    sourceUrl: "https://www.wholefoodsmarket.com/",
    priceMultiplier: 1.21,
    qualityBase: 90,
    distanceMiles: 5.9,
  },
  {
    name: "Trader Joe's",
    source: "scraped",
    sourceUrl: "https://www.traderjoes.com/",
    priceMultiplier: 0.98,
    qualityBase: 84,
    distanceMiles: 6.8,
  },
];

const SEARCH_CATALOG: SearchResultItem[] = [
  {
    id: "instacart-001-organic-eggs",
    title: "Organic Eggs 12ct",
    snippet: "Instacart listing from nearby stores with real-time stock.",
    url: "https://docs.instacart.com/developer_platform_api/",
    source: "api",
  },
  {
    id: "kroger-002-whole-milk",
    title: "Whole Milk 1 gal",
    snippet: "Kroger product record with pricing and fulfillment metadata.",
    url: "https://developer.kroger.com/",
    source: "api",
  },
  {
    id: "openfoodfacts-003-greek-yogurt",
    title: "Greek Yogurt Plain",
    snippet: "Nutrition and ingredient profile enrichment from Open Food Facts.",
    url: "https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/",
    source: "api",
  },
  {
    id: "traderjoes-004-sourdough",
    title: "Sourdough Bread",
    snippet: "Fallback scraped listing from store website catalog page.",
    url: "https://www.traderjoes.com/",
    source: "scraped",
  },
];

const strategyOrder: CartStrategy[] = [
  "lowest_price",
  "best_tradeoff",
  "highest_quality",
];

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000;
  }
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function baseUnitPrice(itemName: string): number {
  const seed = hashSeed(itemName.toLowerCase());
  return 2.2 + ((seed % 70) / 10);
}

function buildCandidates(
  item: CartLineItem,
  zipCode: string,
  maxDistanceMiles: number
): RankedStoreQuote[] {
  return STORE_PROFILES.map((store) => {
    const seed = hashSeed(`${item.name}:${zipCode}:${store.name}`);
    const volatility = 0.9 + (seed % 22) / 100;
    const unitPriceUsd = roundCurrency(
      baseUnitPrice(item.name) * store.priceMultiplier * volatility
    );
    const lineTotalUsd = roundCurrency(unitPriceUsd * item.quantity);
    const qualityScore = clamp(store.qualityBase + ((seed % 14) - 7), 55, 98);
    const distancePenalty = maxDistanceMiles < store.distanceMiles ? 2.5 : 0;

    return {
      itemName: item.name,
      quantity: item.quantity,
      unitPriceUsd,
      lineTotalUsd: roundCurrency(lineTotalUsd + distancePenalty),
      store: store.name,
      distanceMiles: store.distanceMiles,
      qualityScore,
      source: store.source,
      sourceUrl: store.sourceUrl,
    };
  });
}

function scoreCandidate(
  candidate: RankedStoreQuote,
  strategy: CartStrategy,
  qualityBias: CartPlanInput["qualityBias"]
): number {
  const normalizedPrice = candidate.lineTotalUsd;
  const normalizedQuality = 100 - candidate.qualityScore;
  const normalizedDistance = candidate.distanceMiles;

  if (strategy === "lowest_price") {
    return normalizedPrice + normalizedDistance * 0.5;
  }

  if (strategy === "highest_quality") {
    return normalizedQuality * 1.5 + normalizedPrice * 0.15;
  }

  const qualityWeight =
    qualityBias === "high_quality"
      ? 0.55
      : qualityBias === "low_price"
        ? 0.2
        : 0.35;

  return (
    normalizedPrice * (1 - qualityWeight) +
    normalizedQuality * qualityWeight +
    normalizedDistance * 0.35
  );
}

function buildOption(
  input: CartPlanInput,
  strategy: CartStrategy,
  baselineTotal: number
): CartOption {
  const chosenQuotes = input.items.map((item) => {
    const candidates = buildCandidates(item, input.zipCode, input.maxDistanceMiles);
    const ranked = candidates.sort(
      (left, right) =>
        scoreCandidate(left, strategy, input.qualityBias) -
        scoreCandidate(right, strategy, input.qualityBias)
    );
    return ranked[0];
  });

  const totalUsd = roundCurrency(
    chosenQuotes.reduce((sum, quote) => sum + quote.lineTotalUsd, 0)
  );
  const qualityScore = roundCurrency(
    chosenQuotes.reduce((sum, quote) => sum + quote.qualityScore, 0) /
      chosenQuotes.length
  );
  const avgDistanceMiles = roundCurrency(
    chosenQuotes.reduce((sum, quote) => sum + quote.distanceMiles, 0) /
      chosenQuotes.length
  );
  const stores = Array.from(new Set(chosenQuotes.map((quote) => quote.store)));
  const estimatedSavingsUsd = roundCurrency(Math.max(0, baselineTotal - totalUsd));

  const substitutions = chosenQuotes
    .filter((quote) => quote.source === "scraped")
    .map(
      (quote) =>
        `${quote.itemName}: scraped estimate from ${quote.store}, verify with receipt upload`
    );

  return {
    strategy,
    totalUsd,
    estimatedSavingsUsd,
    qualityScore,
    avgDistanceMiles,
    stores,
    substitutions,
    confidence: chosenQuotes.some((quote) => quote.source === "scraped")
      ? "mixed"
      : "api",
    items: chosenQuotes,
  };
}

function baselineCartTotal(input: CartPlanInput): number {
  const naiveQuotes = input.items.flatMap((item) =>
    buildCandidates(item, input.zipCode, input.maxDistanceMiles)
  );
  const avgLineTotal =
    naiveQuotes.reduce((sum, quote) => sum + quote.lineTotalUsd, 0) /
    naiveQuotes.length;
  return roundCurrency(avgLineTotal * input.items.length);
}

export function buildCartOptions(input: CartPlanInput): CartOption[] {
  const baselineTotal = baselineCartTotal(input);
  return strategyOrder.map((strategy) => buildOption(input, strategy, baselineTotal));
}

export function buildItemStoreQuotes(
  input: Pick<CartPlanInput, "zipCode" | "maxDistanceMiles" | "items">
): Record<string, RankedStoreQuote[]> {
  const byItem: Record<string, RankedStoreQuote[]> = {};

  for (const item of input.items) {
    const itemKey = item.name.trim().toLowerCase();
    byItem[itemKey] = buildCandidates(item, input.zipCode, input.maxDistanceMiles);
  }

  return byItem;
}

export function searchCatalog(query: string): SearchResultItem[] {
  const cleaned = query.trim().toLowerCase();
  if (!cleaned) {
    return SEARCH_CATALOG;
  }

  return SEARCH_CATALOG.filter(
    (item) =>
      item.title.toLowerCase().includes(cleaned) ||
      item.snippet.toLowerCase().includes(cleaned)
  );
}

export function getResultById(id: string): SearchResultItem | undefined {
  return SEARCH_CATALOG.find((item) => item.id === id);
}
