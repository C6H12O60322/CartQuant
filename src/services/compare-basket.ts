import "dotenv/config";
import Firecrawl from "@mendable/firecrawl-js";
import { buildItemStoreQuotes } from "../mock-data.js";
import {
  DEMO_ITEMS,
  generateAltId,
  getMockBasketResponse,
} from "../../resources/cartquant-plan/mock-data.js";
import type {
  BasketItemWithAlts,
  CompareBasketResponse,
  ItemAlternative,
  Mode,
  StoreAssignment,
} from "../../resources/cartquant-plan/types.js";

type BuildCompareBasketInput = {
  items: string[];
  avoid?: string[];
  mode: Mode;
};

const DEFAULT_COMPARE_ZIP_CODE = process.env.CARTQUANT_COMPARE_ZIP_CODE ?? "10001";
const DEFAULT_COMPARE_MAX_DISTANCE_MILES = Number.parseFloat(
  process.env.CARTQUANT_COMPARE_MAX_DISTANCE_MILES ?? "8"
);

function getCompareMaxDistanceMiles(): number {
  if (Number.isFinite(DEFAULT_COMPARE_MAX_DISTANCE_MILES) && DEFAULT_COMPARE_MAX_DISTANCE_MILES > 0) {
    return DEFAULT_COMPARE_MAX_DISTANCE_MILES;
  }
  return 8;
}

type TraderJoesProduct = {
  name?: string;
  url?: string;
  category?: string;
  price?: string;
};

const traderJoesExtractSchema = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          category: { type: "string" },
          price: { type: "string" },
        },
      },
    },
  },
};

let firecrawlClient: Firecrawl | null | undefined;

function getFirecrawlClient(): Firecrawl | null {
  if (firecrawlClient !== undefined) {
    return firecrawlClient;
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  firecrawlClient = apiKey ? new Firecrawl({ apiKey }) : null;
  return firecrawlClient;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const cleaned = raw.trim();
    if (!cleaned) {
      continue;
    }
    const normalized = normalizeText(cleaned);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(cleaned);
  }

  return output;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000;
  }
  return hash;
}

function parsePriceUsd(rawPrice: string | undefined, fallback: number): number {
  if (!rawPrice) {
    return fallback;
  }

  const match = rawPrice.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) {
    return fallback;
  }

  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return roundCurrency(parsed);
}

function cloneAlternative(alternative: ItemAlternative): ItemAlternative {
  return {
    altId: alternative.altId,
    product: {
      ...alternative.product,
    },
    health: {
      ...alternative.health,
      flags: [...alternative.health.flags],
    },
    prediction: {
      ...alternative.prediction,
    },
    ingredients: [...(alternative.ingredients ?? [])],
  };
}

function applyCartPlanQuoteData(
  query: string,
  alternatives: ItemAlternative[],
  quotesByItem: Record<string, Array<{ store: string; unitPriceUsd: number; qualityScore: number; source: "api" | "scraped" }>>
): ItemAlternative[] {
  const itemQuotes = quotesByItem[normalizeText(query)] ?? [];
  if (itemQuotes.length === 0) {
    return alternatives;
  }

  const quoteByStore = new Map(itemQuotes.map((quote) => [quote.store, quote]));

  return alternatives.map((alternative) => {
    const quote = quoteByStore.get(alternative.product.store);
    if (!quote) {
      return alternative;
    }

    const sourcePrefix =
      quote.source === "scraped"
        ? "Scraped estimate from build-cart-plan data source."
        : "API estimate from build-cart-plan data source.";

    return {
      ...alternative,
      product: {
        ...alternative.product,
        priceUsd: roundCurrency(quote.unitPriceUsd),
      },
      health: {
        ...alternative.health,
        score: clamp(Math.round(quote.qualityScore), 0, 100),
        summary: `${sourcePrefix} ${alternative.health.summary}`.trim(),
      },
    };
  });
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildSyntheticAlternatives(query: string): ItemAlternative[] {
  const normalized = normalizeText(query);
  const seed = hashSeed(normalized);
  const basePrice = 2.75 + (seed % 450) / 100;
  const qualitySeed = 65 + (seed % 25);

  const candidates: Array<{
    store: string;
    priceFactor: number;
    qualityOffset: number;
    predictionShift: number;
  }> = [
    { store: "Trader Joe's", priceFactor: 1.0, qualityOffset: 9, predictionShift: 0.4 },
    { store: "Kroger", priceFactor: 0.9, qualityOffset: -4, predictionShift: 1.5 },
    { store: "Target", priceFactor: 0.96, qualityOffset: -1, predictionShift: 0.8 },
    { store: "Safeway", priceFactor: 0.98, qualityOffset: -2, predictionShift: 0.9 },
    { store: "Whole Foods", priceFactor: 1.22, qualityOffset: 12, predictionShift: 0.2 },
  ];

  return candidates.map((candidate) => {
    const priceUsd = roundCurrency(basePrice * candidate.priceFactor);
    const healthScore = clamp(qualitySeed + candidate.qualityOffset, 45, 96);
    const productName =
      candidate.store === "Trader Joe's"
        ? `${titleCase(query)}`
        : `${titleCase(query)} (${candidate.store})`;

    return {
      altId: generateAltId(candidate.store, productName),
      product: {
        name: productName,
        brand: candidate.store === "Trader Joe's" ? "Trader Joe's" : candidate.store,
        size: "1 unit",
        store: candidate.store,
        priceUsd,
      },
      health: {
        score: healthScore,
        flags: [],
        summary: "Estimated profile generated from fallback catalog data.",
      },
      prediction: {
        direction: candidate.predictionShift > 1 ? "rising" : "flat",
        percentChange: roundCurrency(candidate.predictionShift),
        confidence: 58,
        recommendation: "Estimated trend from fallback model.",
      },
      ingredients: [],
    };
  });
}

function sortAlternatives(
  alternatives: ItemAlternative[],
  mode: Mode
): ItemAlternative[] {
  const sorted = [...alternatives];
  if (sorted.length <= 1) {
    return sorted;
  }

  if (mode === "cheapest") {
    sorted.sort((left, right) => left.product.priceUsd - right.product.priceUsd);
    return sorted;
  }

  if (mode === "cleanest") {
    sorted.sort((left, right) => {
      if (right.health.score !== left.health.score) {
        return right.health.score - left.health.score;
      }
      return left.product.priceUsd - right.product.priceUsd;
    });
    return sorted;
  }

  const maxPrice = Math.max(...sorted.map((entry) => entry.product.priceUsd), 1);
  const score = (entry: ItemAlternative): number =>
    (1 - entry.product.priceUsd / maxPrice) * 0.4 + (entry.health.score / 100) * 0.6;

  sorted.sort((left, right) => score(right) - score(left));
  return sorted;
}

function applyAvoidPenalties(
  alternatives: ItemAlternative[],
  avoidList: string[]
): ItemAlternative[] {
  const filters = avoidList.map(normalizeText).filter(Boolean);
  if (filters.length === 0) {
    return alternatives;
  }

  return alternatives.map((alternative) => {
    const searchable = [
      alternative.product.name,
      alternative.product.brand,
      alternative.health.summary,
      ...alternative.health.flags,
    ]
      .join(" ")
      .toLowerCase();

    const matchedTerms = filters.filter((term) => searchable.includes(term));
    if (matchedTerms.length === 0) {
      return alternative;
    }

    const scorePenalty = matchedTerms.length * 10;
    const reducedScore = clamp(alternative.health.score - scorePenalty, 0, 100);
    const updatedFlags = Array.from(
      new Set([...alternative.health.flags, ...matchedTerms.map((term) => `avoid:${term}`)])
    );

    return {
      ...alternative,
      health: {
        ...alternative.health,
        score: reducedScore,
        flags: updatedFlags,
        summary: `${alternative.health.summary} Penalized for avoid list: ${matchedTerms.join(
          ", "
        )}.`,
      },
    };
  });
}

async function searchTraderJoesProduct(query: string): Promise<TraderJoesProduct | null> {
  const client = getFirecrawlClient();
  if (!client) {
    return null;
  }

  try {
    const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(query)}`;
    const scrapeResult = await (client as any).v1.scrapeUrl(searchUrl, {
      formats: ["extract"],
      extract: {
        schema: traderJoesExtractSchema as any,
      },
    });

    if (!scrapeResult.success) {
      return null;
    }

    const extracted = scrapeResult.extract?.products;
    if (!Array.isArray(extracted) || extracted.length === 0) {
      return null;
    }

    const first = extracted[0] as TraderJoesProduct;
    if (!first || typeof first !== "object") {
      return null;
    }

    return first;
  } catch {
    return null;
  }
}

function buildTraderJoesAlternative(
  query: string,
  scraped: TraderJoesProduct | null,
  existing: ItemAlternative | undefined
): ItemAlternative {
  const fallbackPrice = existing?.product.priceUsd ?? roundCurrency(2.99 + (hashSeed(query) % 400) / 100);
  const scrapedName = scraped?.name?.trim();
  const productName = scrapedName && scrapedName.length > 0 ? scrapedName : titleCase(query);
  const priceUsd = parsePriceUsd(scraped?.price, fallbackPrice);

  return {
    altId: generateAltId("Trader Joe's", productName),
    product: {
      name: productName,
      brand: "Trader Joe's",
      size: existing?.product.size ?? "1 unit",
      store: "Trader Joe's",
      priceUsd,
    },
    health: {
      score: existing?.health.score ?? 82,
      flags: existing?.health.flags ? [...existing.health.flags] : [],
      summary:
        existing?.health.summary ??
        "Trader Joe's item from scrape search. Detailed ingredient analysis pending.",
    },
    prediction: {
      direction: existing?.prediction.direction ?? "flat",
      percentChange: existing?.prediction.percentChange ?? 0.8,
      confidence: existing?.prediction.confidence ?? 64,
      recommendation:
        existing?.prediction.recommendation ??
        "Live scrape price captured. Trend estimate from fallback model.",
    },
    ingredients: existing?.ingredients ? [...existing.ingredients] : [],
  };
}

function buildPlan(
  mode: Mode,
  items: BasketItemWithAlts[]
): CompareBasketResponse["plan"] {
  const bestPerItem = items
    .map((item) => item.alternatives[0])
    .filter((entry): entry is ItemAlternative => Boolean(entry));

  const totalUsd = roundCurrency(
    bestPerItem.reduce((sum, alternative) => sum + alternative.product.priceUsd, 0)
  );

  const avgDirectionalChange =
    bestPerItem.length === 0
      ? 0
      : bestPerItem.reduce((sum, alternative) => {
          const directionSign = alternative.prediction.direction === "falling" ? -1 : 1;
          return sum + alternative.prediction.percentChange * directionSign;
        }, 0) / bestPerItem.length;

  const avgConfidence =
    bestPerItem.length === 0
      ? 60
      : bestPerItem.reduce((sum, alternative) => sum + alternative.prediction.confidence, 0) /
        bestPerItem.length;

  const storeMap = new Map<string, { items: string[]; subtotal: number }>();
  for (const item of items) {
    const selected = item.alternatives[0];
    if (!selected) {
      continue;
    }
    const current = storeMap.get(selected.product.store) ?? { items: [], subtotal: 0 };
    current.items.push(item.query);
    current.subtotal += selected.product.priceUsd;
    storeMap.set(selected.product.store, current);
  }

  const storeBreakdown: StoreAssignment[] = Array.from(storeMap.entries()).map(
    ([store, data]) => ({
      store,
      items: data.items,
      subtotalUsd: roundCurrency(data.subtotal),
    })
  );

  const summaryParts = storeBreakdown.map(
    (entry) =>
      `${entry.store} for ${entry.items.length} item${entry.items.length === 1 ? "" : "s"}`
  );
  const summary =
    summaryParts.length <= 1
      ? `Best plan: all items from ${summaryParts[0]?.split(" for ")[0] ?? "one store"}`
      : `Best plan: ${summaryParts.join(", ")}`;

  const baselineTotal = roundCurrency(
    items.reduce((sum, item) => {
      const highest = Math.max(...item.alternatives.map((entry) => entry.product.priceUsd));
      return sum + highest;
    }, 0)
  );
  const estimatedSavings = Math.max(0, roundCurrency(baselineTotal - totalUsd));

  return {
    summary,
    totalUsd,
    totalPrediction: {
      direction: avgDirectionalChange > 1 ? "rising" : avgDirectionalChange < -1 ? "falling" : "flat",
      percentChange: roundCurrency(Math.abs(avgDirectionalChange)),
      confidence: Math.round(avgConfidence),
      recommendation:
        mode === "cheapest"
          ? "Price-first plan selected. Consider buying rising categories now."
          : mode === "cleanest"
            ? "Quality-first plan selected. Lowest-risk ingredient profile."
            : "Balanced plan selected across price and quality.",
    },
    storeBreakdown,
    savings: `Estimated savings vs highest-price options: $${estimatedSavings.toFixed(2)}`,
  };
}

export async function buildCompareBasketResponse(
  input: BuildCompareBasketInput
): Promise<CompareBasketResponse> {
  const mode = input.mode;
  const requestedItems = uniqueQueries(input.items);
  const items = requestedItems.length > 0 ? requestedItems : [...DEMO_ITEMS];
  const avoidList = (input.avoid ?? []).map((entry) => entry.trim()).filter(Boolean);

  const mockResponse = getMockBasketResponse(mode);
  const mockByQuery = new Map(
    mockResponse.items.map((entry) => [normalizeText(entry.query), entry])
  );
  const quotesByItem = buildItemStoreQuotes({
    zipCode: DEFAULT_COMPARE_ZIP_CODE,
    maxDistanceMiles: getCompareMaxDistanceMiles(),
    items: items.map((name) => ({
      name,
      quantity: 1,
    })),
  });

  const itemResults = await Promise.all(
    items.map(async (query): Promise<BasketItemWithAlts> => {
      const normalizedQuery = normalizeText(query);
      const seededAlternatives = (
        mockByQuery.get(normalizedQuery)?.alternatives ?? buildSyntheticAlternatives(query)
      ).map(cloneAlternative);
      const baseAlternatives = applyCartPlanQuoteData(
        query,
        seededAlternatives,
        quotesByItem
      );

      const existingTraderJoes = baseAlternatives.find(
        (alternative) => alternative.product.store === "Trader Joe's"
      );
      const scrapedProduct = await searchTraderJoesProduct(query);
      const traderJoesAlternative = buildTraderJoesAlternative(
        query,
        scrapedProduct,
        existingTraderJoes
      );

      const withoutTraderJoes = baseAlternatives.filter(
        (alternative) => alternative.product.store !== "Trader Joe's"
      );
      const mergedAlternatives = [traderJoesAlternative, ...withoutTraderJoes];
      const filteredAlternatives = applyAvoidPenalties(mergedAlternatives, avoidList);
      const sortedAlternatives = sortAlternatives(filteredAlternatives, mode);

      return {
        query,
        alternatives: sortedAlternatives,
      };
    })
  );

  return {
    mode,
    plan: buildPlan(mode, itemResults),
    items: itemResults,
  };
}
