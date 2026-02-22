import "dotenv/config";
import {
  searchAllStores,
  isScraperConfigured,
  getStoreName,
  getAllStoreIds,
  type StoreId,
  type ScrapedProduct,
  type StoreSearchResult,
} from "./grocery-scraper.js";
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

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const cleaned = raw.trim();
    if (!cleaned) continue;
    const normalized = normalizeText(cleaned);
    if (seen.has(normalized)) continue;
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

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function parsePriceUsd(rawPrice: string | undefined, fallback: number): number {
  if (!rawPrice) return fallback;
  const match = rawPrice.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return fallback;
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return roundCurrency(parsed);
}

/**
 * Estimate a health score from scraped product data.
 * Uses keyword heuristics since search results don't include nutrition info.
 */
function estimateHealthScore(product: ScrapedProduct): number {
  const text = [product.name, product.description, product.brand, product.category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 70;
  if (text.includes("organic")) score += 12;
  if (text.includes("natural")) score += 5;
  if (text.includes("whole grain") || text.includes("whole wheat")) score += 6;
  if (text.includes("no added sugar") || text.includes("unsweetened")) score += 5;
  if (text.includes("free range") || text.includes("pasture")) score += 8;
  if (text.includes("non-gmo")) score += 4;
  if (text.includes("gluten free")) score += 2;

  if (text.includes("artificial")) score -= 10;
  if (text.includes("high fructose")) score -= 12;
  if (text.includes("processed")) score -= 5;

  return clamp(score, 30, 98);
}

/**
 * Convert a scraped product into an ItemAlternative.
 */
function scrapedToAlternative(
  product: ScrapedProduct,
  query: string
): ItemAlternative {
  const fallbackPrice = roundCurrency(2.99 + (hashSeed(query) % 400) / 100);
  const priceUsd = parsePriceUsd(product.price, fallbackPrice);
  const healthScore = estimateHealthScore(product);
  const productName = product.name?.trim() || titleCase(query);

  const seed = hashSeed(product.store + productName);
  const predictionShift = roundCurrency(0.3 + (seed % 30) / 10);

  return {
    altId: generateAltId(product.store, productName),
    product: {
      name: productName,
      brand: product.brand?.trim() || product.store,
      size: "1 unit",
      store: product.store,
      priceUsd,
      imageUrl: product.image_url,
      description: product.description,
      url: product.url,
    },
    health: {
      score: healthScore,
      flags: [],
      summary: `Scraped from ${product.store}. Health score estimated from product keywords.`,
    },
    prediction: {
      direction: predictionShift > 2 ? "rising" : "flat",
      percentChange: predictionShift,
      confidence: 55,
      recommendation: "Live price captured. Trend requires historical data.",
    },
    ingredients: [],
  };
}

/**
 * Build synthetic alternatives when scraping is unavailable.
 */
function buildSyntheticAlternatives(query: string): ItemAlternative[] {
  const normalized = normalizeText(query);
  const seed = hashSeed(normalized);
  const basePrice = 2.75 + (seed % 450) / 100;
  const qualitySeed = 65 + (seed % 25);

  const candidates: Array<{
    storeId: StoreId;
    priceFactor: number;
    qualityOffset: number;
    predictionShift: number;
  }> = [
    { storeId: "traderjoes", priceFactor: 1.0, qualityOffset: 9, predictionShift: 0.4 },
    { storeId: "target", priceFactor: 0.96, qualityOffset: -1, predictionShift: 0.8 },
  ];

  return candidates.map((c) => {
    const storeName = getStoreName(c.storeId);
    const priceUsd = roundCurrency(basePrice * c.priceFactor);
    const healthScore = clamp(qualitySeed + c.qualityOffset, 45, 96);
    const productName = `${titleCase(query)} (${storeName})`;

    return {
      altId: generateAltId(storeName, productName),
      product: {
        name: productName,
        brand: storeName,
        size: "1 unit",
        store: storeName,
        priceUsd,
      },
      health: {
        score: healthScore,
        flags: [],
        summary: "Estimated from fallback catalog data. No live scraping available.",
      },
      prediction: {
        direction: c.predictionShift > 1 ? "rising" : ("flat" as const),
        percentChange: roundCurrency(c.predictionShift),
        confidence: 45,
        recommendation: "Estimated trend. Configure FIRECRAWL_API_KEY for live data.",
      },
      ingredients: [],
    };
  });
}

function sortAlternatives(alternatives: ItemAlternative[], mode: Mode): ItemAlternative[] {
  const sorted = [...alternatives];
  if (sorted.length <= 1) return sorted;

  if (mode === "cheapest") {
    sorted.sort((a, b) => a.product.priceUsd - b.product.priceUsd);
    return sorted;
  }

  if (mode === "cleanest") {
    sorted.sort((a, b) => {
      if (b.health.score !== a.health.score) return b.health.score - a.health.score;
      return a.product.priceUsd - b.product.priceUsd;
    });
    return sorted;
  }

  const maxPrice = Math.max(...sorted.map((e) => e.product.priceUsd), 1);
  const score = (e: ItemAlternative): number =>
    (1 - e.product.priceUsd / maxPrice) * 0.4 + (e.health.score / 100) * 0.6;
  sorted.sort((a, b) => score(b) - score(a));
  return sorted;
}

function applyAvoidPenalties(alternatives: ItemAlternative[], avoidList: string[]): ItemAlternative[] {
  const filters = avoidList.map(normalizeText).filter(Boolean);
  if (filters.length === 0) return alternatives;

  return alternatives.map((alt) => {
    const searchable = [
      alt.product.name,
      alt.product.brand,
      alt.product.description ?? "",
      alt.health.summary,
      ...alt.health.flags,
    ]
      .join(" ")
      .toLowerCase();

    const matched = filters.filter((term) => searchable.includes(term));
    if (matched.length === 0) return alt;

    const penalty = matched.length * 10;
    return {
      ...alt,
      health: {
        ...alt.health,
        score: clamp(alt.health.score - penalty, 0, 100),
        flags: Array.from(new Set([...alt.health.flags, ...matched.map((t) => `avoid:${t}`)])),
        summary: `${alt.health.summary} Penalized for: ${matched.join(", ")}.`,
      },
    };
  });
}

/**
 * Build alternatives for a single item using real scraping.
 * Falls back to mock/synthetic data per store when scraping fails.
 */
async function buildAlternativesForItem(
  query: string,
  storeIds: StoreId[]
): Promise<ItemAlternative[]> {
  if (!isScraperConfigured()) {
    return buildSyntheticAlternatives(query);
  }

  const storeResults = await searchAllStores(query, storeIds, 1);
  const alternatives: ItemAlternative[] = [];

  for (const storeId of storeIds) {
    const result: StoreSearchResult | undefined = storeResults[storeId];
    const topProduct = result?.products?.[0];

    if (topProduct && topProduct.name) {
      alternatives.push(scrapedToAlternative(topProduct, query));
    } else {
      const storeName = getStoreName(storeId);
      const seed = hashSeed(query + storeName);
      const basePrice = roundCurrency(2.99 + (seed % 400) / 100);

      alternatives.push({
        altId: generateAltId(storeName, titleCase(query)),
        product: {
          name: `${titleCase(query)}`,
          brand: storeName,
          size: "1 unit",
          store: storeName,
          priceUsd: basePrice,
        },
        health: {
          score: 70,
          flags: [],
          summary: result?.error
            ? `Scraping failed for ${storeName}: ${result.error}`
            : `No results found on ${storeName}.`,
        },
        prediction: {
          direction: "flat",
          percentChange: 0.5,
          confidence: 40,
          recommendation: "Fallback estimate. Could not retrieve live data.",
        },
        ingredients: [],
      });
    }
  }

  return alternatives;
}

function buildPlan(mode: Mode, items: BasketItemWithAlts[]): CompareBasketResponse["plan"] {
  const bestPerItem = items
    .map((item) => item.alternatives[0])
    .filter((entry): entry is ItemAlternative => Boolean(entry));

  const totalUsd = roundCurrency(
    bestPerItem.reduce((sum, alt) => sum + alt.product.priceUsd, 0)
  );

  const avgDirectionalChange =
    bestPerItem.length === 0
      ? 0
      : bestPerItem.reduce((sum, alt) => {
          const sign = alt.prediction.direction === "falling" ? -1 : 1;
          return sum + alt.prediction.percentChange * sign;
        }, 0) / bestPerItem.length;

  const avgConfidence =
    bestPerItem.length === 0
      ? 60
      : bestPerItem.reduce((sum, alt) => sum + alt.prediction.confidence, 0) /
        bestPerItem.length;

  const storeMap = new Map<string, { items: string[]; subtotal: number }>();
  for (const item of items) {
    const selected = item.alternatives[0];
    if (!selected) continue;
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
    (e) => `${e.store} for ${e.items.length} item${e.items.length === 1 ? "" : "s"}`
  );
  const summary =
    summaryParts.length <= 1
      ? `Best plan: all items from ${summaryParts[0]?.split(" for ")[0] ?? "one store"}`
      : `Best plan: ${summaryParts.join(", ")}`;

  const baselineTotal = roundCurrency(
    items.reduce((sum, item) => {
      const highest = Math.max(...item.alternatives.map((e) => e.product.priceUsd));
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

/**
 * Main entry point: builds a compare-basket response using real scraping
 * with automatic fallback to mock data when scraping is unavailable.
 */
export async function buildCompareBasketResponse(
  input: BuildCompareBasketInput
): Promise<CompareBasketResponse> {
  const mode = input.mode;
  const requestedItems = uniqueQueries(input.items);
  const items = requestedItems.length > 0 ? requestedItems : [...DEMO_ITEMS];
  const avoidList = (input.avoid ?? []).map((e) => e.trim()).filter(Boolean);
  const storeIds = getAllStoreIds();

  if (!isScraperConfigured()) {
    console.warn("FIRECRAWL_API_KEY not set — returning mock data as fallback.");
    return getMockBasketResponse(mode);
  }

  const itemResults = await Promise.all(
    items.map(async (query): Promise<BasketItemWithAlts> => {
      const rawAlternatives = await buildAlternativesForItem(query, storeIds);
      const filtered = applyAvoidPenalties(rawAlternatives, avoidList);
      const sorted = sortAlternatives(filtered, mode);

      return { query, alternatives: sorted };
    })
  );

  return {
    mode,
    plan: buildPlan(mode, itemResults),
    items: itemResults,
  };
}
