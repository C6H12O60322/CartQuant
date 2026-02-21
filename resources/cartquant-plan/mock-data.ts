import type { CompareBasketResponse, ItemAlternative, Mode } from "./types";

// --- altId helper ---

/** Deterministic key: storeName + ":" + normalized product name */
export function generateAltId(store: string, productName: string): string {
  return store + ":" + productName.toLowerCase().replace(/\s+/g, "-");
}

// --- Store definitions with SF coordinates ---

export const STORES = [
  { name: "Trader Joe's", lat: 37.7649, lng: -122.4194 },
  { name: "Whole Foods", lat: 37.7879, lng: -122.4074 },
  { name: "Safeway", lat: 37.7749, lng: -122.4294 },
  { name: "Kroger", lat: 37.7549, lng: -122.4094 },
  { name: "Target", lat: 37.7849, lng: -122.4394 },
] as const;

/** Returns the store object (with lat/lng) for a given name, or null if not found. */
export function getStoreForName(name: string): (typeof STORES)[number] | null {
  return STORES.find((s) => s.name === name) ?? null;
}

export const DEMO_ITEMS = ["milk", "eggs", "cereal", "yogurt", "bread", "chicken"];

/** Same items list, exported separately for the "Load Demo Basket" button. */
export const DEMO_BASKET_ITEMS = [...DEMO_ITEMS];

// --- Per-store alternatives for each item ---
// Each item has 5 alternatives (one per store), with realistic data.
// Modes differ in ordering/recommendation, not raw data.

type ItemData = Record<string, ItemAlternative[]>;

const allItemAlternatives: ItemData = {
  milk: [
    {
      altId: generateAltId("Trader Joe's", "Organic Whole Milk"),
      product: { name: "Organic Whole Milk", brand: "Trader Joe's", size: "1 gal", store: "Trader Joe's", priceUsd: 4.49 },
      health: { score: 88, flags: [], summary: "Organic, no hormones, good value." },
      prediction: { direction: "flat", percentChange: 0.6, confidence: 79, recommendation: "Stable price, buy anytime." },
    },
    {
      altId: generateAltId("Whole Foods", "Organic Valley Whole Milk"),
      product: { name: "Organic Valley Whole Milk", brand: "Organic Valley", size: "1 gal", store: "Whole Foods", priceUsd: 6.49 },
      health: { score: 95, flags: [], summary: "Pasture-raised, organic, no hormones or antibiotics." },
      prediction: { direction: "flat", percentChange: 0.3, confidence: 85, recommendation: "Stable organic dairy pricing." },
    },
    {
      altId: generateAltId("Safeway", "Lucerne Whole Milk"),
      product: { name: "Lucerne Whole Milk", brand: "Lucerne", size: "1 gal", store: "Safeway", priceUsd: 3.99 },
      health: { score: 70, flags: ["rBST hormones"], summary: "Conventional milk, standard nutrition." },
      prediction: { direction: "rising", percentChange: 2.1, confidence: 72, recommendation: "Prices climbing, buy soon." },
    },
    {
      altId: generateAltId("Kroger", "Great Value Whole Milk"),
      product: { name: "Great Value Whole Milk", brand: "Great Value", size: "1 gal", store: "Kroger", priceUsd: 3.29 },
      health: { score: 72, flags: ["rBST hormones"], summary: "Standard conventional milk, adequate nutrition." },
      prediction: { direction: "rising", percentChange: 4.1, confidence: 81, recommendation: "Buy now, dairy prices rising regionally." },
    },
    {
      altId: generateAltId("Target", "Good & Gather Whole Milk"),
      product: { name: "Good & Gather Whole Milk", brand: "Good & Gather", size: "1 gal", store: "Target", priceUsd: 4.19 },
      health: { score: 74, flags: [], summary: "Conventional but hormone-free milk." },
      prediction: { direction: "flat", percentChange: 0.8, confidence: 76, recommendation: "Stable, buy anytime." },
    },
  ],
  eggs: [
    {
      altId: generateAltId("Trader Joe's", "Free Range Eggs"),
      product: { name: "Free Range Eggs", brand: "Trader Joe's", size: "12 ct", store: "Trader Joe's", priceUsd: 4.99 },
      health: { score: 83, flags: [], summary: "Free range, no antibiotics." },
      prediction: { direction: "falling", percentChange: 1.8, confidence: 64, recommendation: "Prices easing, can wait a few days." },
    },
    {
      altId: generateAltId("Whole Foods", "Vital Farms Pasture-Raised Eggs"),
      product: { name: "Vital Farms Pasture-Raised Eggs", brand: "Vital Farms", size: "12 ct", store: "Whole Foods", priceUsd: 7.99 },
      health: { score: 97, flags: [], summary: "Pasture-raised, certified humane, no antibiotics." },
      prediction: { direction: "falling", percentChange: 1.5, confidence: 62, recommendation: "Slight drop expected, can wait." },
    },
    {
      altId: generateAltId("Safeway", "Lucerne Cage-Free Eggs"),
      product: { name: "Lucerne Cage-Free Eggs", brand: "Lucerne", size: "12 ct", store: "Safeway", priceUsd: 4.29 },
      health: { score: 75, flags: ["cage-free"], summary: "Cage-free but conventional feed." },
      prediction: { direction: "flat", percentChange: 0.5, confidence: 70, recommendation: "Stable pricing." },
    },
    {
      altId: generateAltId("Kroger", "Goldhen Cage-Free Eggs"),
      product: { name: "Goldhen Cage-Free Eggs", brand: "Goldhen", size: "12 ct", store: "Kroger", priceUsd: 3.49 },
      health: { score: 78, flags: ["cage-free"], summary: "Cage-free but conventional feed." },
      prediction: { direction: "falling", percentChange: 2.3, confidence: 66, recommendation: "Wait if possible, prices softening." },
    },
    {
      altId: generateAltId("Target", "Good & Gather Free Range Eggs"),
      product: { name: "Good & Gather Free Range Eggs", brand: "Good & Gather", size: "12 ct", store: "Target", priceUsd: 4.79 },
      health: { score: 80, flags: [], summary: "Free range, no antibiotics." },
      prediction: { direction: "flat", percentChange: 0.4, confidence: 73, recommendation: "Price is stable." },
    },
  ],
  cereal: [
    {
      altId: generateAltId("Trader Joe's", "Organic O's"),
      product: { name: "Organic O's", brand: "Trader Joe's", size: "14 oz", store: "Trader Joe's", priceUsd: 3.29 },
      health: { score: 82, flags: ["added sugar"], summary: "Organic with modest sugar, no artificial ingredients." },
      prediction: { direction: "flat", percentChange: 0.3, confidence: 87, recommendation: "Stable." },
    },
    {
      altId: generateAltId("Whole Foods", "Nature's Path Organic Heritage Flakes"),
      product: { name: "Nature's Path Organic Heritage Flakes", brand: "Nature's Path", size: "13.25 oz", store: "Whole Foods", priceUsd: 5.49 },
      health: { score: 91, flags: [], summary: "Whole grain, organic, low sugar, no additives." },
      prediction: { direction: "flat", percentChange: 0.1, confidence: 90, recommendation: "Very stable price." },
    },
    {
      altId: generateAltId("Safeway", "O Organics Honey O's"),
      product: { name: "O Organics Honey O's", brand: "O Organics", size: "14 oz", store: "Safeway", priceUsd: 3.79 },
      health: { score: 73, flags: ["added sugar"], summary: "Organic base but added honey sweetener." },
      prediction: { direction: "flat", percentChange: 0.6, confidence: 82, recommendation: "Stable pricing." },
    },
    {
      altId: generateAltId("Kroger", "Malt-O-Meal Fruity Dyno-Bites"),
      product: { name: "Malt-O-Meal Fruity Dyno-Bites", brand: "Malt-O-Meal", size: "32 oz", store: "Kroger", priceUsd: 3.99 },
      health: { score: 38, flags: ["high sugar", "artificial colors", "BHT preservative"], summary: "High sugar cereal with artificial additives." },
      prediction: { direction: "flat", percentChange: 0.4, confidence: 88, recommendation: "Stable pricing, buy anytime." },
    },
    {
      altId: generateAltId("Target", "Market Pantry Toasted Oats"),
      product: { name: "Market Pantry Toasted Oats", brand: "Market Pantry", size: "14 oz", store: "Target", priceUsd: 2.99 },
      health: { score: 71, flags: ["added sugar"], summary: "Basic cereal, low additive count." },
      prediction: { direction: "flat", percentChange: 0.2, confidence: 85, recommendation: "Very stable." },
    },
  ],
  yogurt: [
    {
      altId: generateAltId("Trader Joe's", "Greek Yogurt"),
      product: { name: "Greek Yogurt", brand: "Trader Joe's", size: "32 oz", store: "Trader Joe's", priceUsd: 4.99 },
      health: { score: 80, flags: ["natural flavors"], summary: "Good protein, minimal additives." },
      prediction: { direction: "rising", percentChange: 1.4, confidence: 61, recommendation: "Mild increase, fine to buy now." },
    },
    {
      altId: generateAltId("Whole Foods", "Stonyfield Organic Greek Yogurt"),
      product: { name: "Stonyfield Organic Greek Yogurt", brand: "Stonyfield", size: "32 oz", store: "Whole Foods", priceUsd: 6.29 },
      health: { score: 88, flags: ["added sugar"], summary: "Organic with live cultures, minimal sugar added." },
      prediction: { direction: "rising", percentChange: 2.1, confidence: 55, recommendation: "Slight increase likely, buy soon." },
    },
    {
      altId: generateAltId("Safeway", "Signature Select Greek Yogurt"),
      product: { name: "Signature Select Greek Yogurt", brand: "Signature Select", size: "32 oz", store: "Safeway", priceUsd: 4.49 },
      health: { score: 72, flags: ["added sugar", "natural flavors"], summary: "Standard yogurt with moderate additives." },
      prediction: { direction: "flat", percentChange: 0.7, confidence: 74, recommendation: "Stable." },
    },
    {
      altId: generateAltId("Kroger", "Great Value Greek Yogurt"),
      product: { name: "Great Value Greek Yogurt", brand: "Great Value", size: "32 oz", store: "Kroger", priceUsd: 4.28 },
      health: { score: 68, flags: ["added sugar", "natural flavors"], summary: "Good protein but has added sweeteners." },
      prediction: { direction: "rising", percentChange: 1.8, confidence: 59, recommendation: "Mild upward trend, OK to buy now." },
    },
    {
      altId: generateAltId("Target", "Good & Gather Greek Yogurt"),
      product: { name: "Good & Gather Greek Yogurt", brand: "Good & Gather", size: "32 oz", store: "Target", priceUsd: 4.59 },
      health: { score: 76, flags: ["natural flavors"], summary: "Decent quality, minimal additives." },
      prediction: { direction: "flat", percentChange: 0.5, confidence: 71, recommendation: "Stable pricing." },
    },
  ],
  bread: [
    {
      altId: generateAltId("Trader Joe's", "Whole Wheat Bread"),
      product: { name: "Whole Wheat Bread", brand: "Trader Joe's", size: "24 oz", store: "Trader Joe's", priceUsd: 3.49 },
      health: { score: 79, flags: [], summary: "Whole wheat, no HFCS, short ingredient list." },
      prediction: { direction: "flat", percentChange: 0.2, confidence: 89, recommendation: "Very stable." },
    },
    {
      altId: generateAltId("Whole Foods", "Dave's Killer Bread 21 Whole Grains"),
      product: { name: "Dave's Killer Bread 21 Whole Grains", brand: "Dave's Killer Bread", size: "27 oz", store: "Whole Foods", priceUsd: 5.99 },
      health: { score: 86, flags: [], summary: "Organic whole grains, high fiber, no HFCS." },
      prediction: { direction: "flat", percentChange: 0.5, confidence: 83, recommendation: "Stable pricing." },
    },
    {
      altId: generateAltId("Safeway", "Oroweat Whole Wheat"),
      product: { name: "Oroweat Whole Wheat", brand: "Oroweat", size: "24 oz", store: "Safeway", priceUsd: 4.29 },
      health: { score: 74, flags: ["dough conditioners"], summary: "Whole wheat with some processing aids." },
      prediction: { direction: "flat", percentChange: 0.3, confidence: 86, recommendation: "Stable." },
    },
    {
      altId: generateAltId("Kroger", "L'Oven Fresh White Bread"),
      product: { name: "L'Oven Fresh White Bread", brand: "L'Oven Fresh", size: "20 oz", store: "Kroger", priceUsd: 1.89 },
      health: { score: 45, flags: ["high fructose corn syrup", "dough conditioners"], summary: "Budget bread with processed ingredients." },
      prediction: { direction: "flat", percentChange: 0.2, confidence: 91, recommendation: "Price is stable." },
    },
    {
      altId: generateAltId("Target", "Good & Gather Wheat Bread"),
      product: { name: "Good & Gather Wheat Bread", brand: "Good & Gather", size: "20 oz", store: "Target", priceUsd: 3.29 },
      health: { score: 73, flags: [], summary: "Simple wheat bread, short ingredient list." },
      prediction: { direction: "flat", percentChange: 0.4, confidence: 80, recommendation: "Stable." },
    },
  ],
  chicken: [
    {
      altId: generateAltId("Trader Joe's", "All Natural Chicken Breast"),
      product: { name: "All Natural Chicken Breast", brand: "Trader Joe's", size: "2.5 lb", store: "Trader Joe's", priceUsd: 11.91 },
      health: { score: 81, flags: ["water added"], summary: "No antibiotics, minimal processing. Some water retained." },
      prediction: { direction: "rising", percentChange: 4.2, confidence: 75, recommendation: "Poultry trending up, buy now." },
    },
    {
      altId: generateAltId("Whole Foods", "Bell & Evans Air Chilled Chicken Breast"),
      product: { name: "Bell & Evans Air Chilled Chicken Breast", brand: "Bell & Evans", size: "2 lb", store: "Whole Foods", priceUsd: 10.62 },
      health: { score: 93, flags: [], summary: "Air chilled, no antibiotics, no added solutions." },
      prediction: { direction: "rising", percentChange: 3.9, confidence: 72, recommendation: "Organic poultry rising, buy now." },
    },
    {
      altId: generateAltId("Safeway", "Open Nature Chicken Breast"),
      product: { name: "Open Nature Chicken Breast", brand: "Open Nature", size: "2.5 lb", store: "Safeway", priceUsd: 10.99 },
      health: { score: 77, flags: ["water added"], summary: "Antibiotic-free but water-added." },
      prediction: { direction: "rising", percentChange: 3.5, confidence: 70, recommendation: "Poultry prices climbing." },
    },
    {
      altId: generateAltId("Kroger", "Kroger Boneless Chicken Breast"),
      product: { name: "Kroger Boneless Chicken Breast", brand: "Kroger", size: "3 lb", store: "Kroger", priceUsd: 10.49 },
      health: { score: 65, flags: ["water added", "sodium solution"], summary: "Conventional chicken with added sodium solution." },
      prediction: { direction: "rising", percentChange: 5.7, confidence: 77, recommendation: "Buy now, poultry prices rising sharply." },
    },
    {
      altId: generateAltId("Target", "Good & Gather Chicken Breast"),
      product: { name: "Good & Gather Chicken Breast", brand: "Good & Gather", size: "2.5 lb", store: "Target", priceUsd: 11.49 },
      health: { score: 78, flags: [], summary: "No antibiotics ever, minimally processed." },
      prediction: { direction: "rising", percentChange: 3.8, confidence: 73, recommendation: "Poultry prices rising, buy soon." },
    },
  ],
};

// --- Mode-based ordering ---
// cheapest: sort by price ascending
// cleanest: sort by health score descending
// balanced: sort by combined score (normalize price + health)

function sortAlternatives(alts: ItemAlternative[], mode: Mode): ItemAlternative[] {
  const sorted = [...alts];
  switch (mode) {
    case "cheapest":
      sorted.sort((a, b) => a.product.priceUsd - b.product.priceUsd);
      break;
    case "cleanest":
      sorted.sort((a, b) => b.health.score - a.health.score);
      break;
    case "balanced": {
      // Combined: lower price is better, higher health is better
      // Normalize: price weight 0.4, health weight 0.6
      const maxPrice = Math.max(...sorted.map((a) => a.product.priceUsd));
      const score = (a: ItemAlternative) =>
        (1 - a.product.priceUsd / maxPrice) * 0.4 + (a.health.score / 100) * 0.6;
      sorted.sort((a, b) => score(b) - score(a));
      break;
    }
  }
  return sorted;
}

// --- Build response for a given mode ---

function buildResponse(mode: Mode): CompareBasketResponse {
  const items = DEMO_ITEMS.map((query) => ({
    query,
    alternatives: sortAlternatives(allItemAlternatives[query], mode),
  }));

  // Compute plan: pick best (first) alternative per item
  const bestPerItem = items.map((item) => item.alternatives[0]);
  const totalUsd = bestPerItem.reduce((sum, alt) => sum + alt.product.priceUsd, 0);

  // Aggregate prediction
  const avgChange =
    bestPerItem.reduce((sum, alt) => {
      const sign = alt.prediction.direction === "falling" ? -1 : 1;
      return sum + alt.prediction.percentChange * sign;
    }, 0) / bestPerItem.length;
  const avgConfidence =
    bestPerItem.reduce((sum, alt) => sum + alt.prediction.confidence, 0) / bestPerItem.length;

  // Build store breakdown
  const storeMap = new Map<string, { items: string[]; subtotal: number }>();
  for (const item of items) {
    const best = item.alternatives[0];
    const store = best.product.store;
    const entry = storeMap.get(store) ?? { items: [], subtotal: 0 };
    entry.items.push(item.query);
    entry.subtotal += best.product.priceUsd;
    storeMap.set(store, entry);
  }

  const storeBreakdown = Array.from(storeMap.entries()).map(([store, data]) => ({
    store,
    items: data.items,
    subtotalUsd: Math.round(data.subtotal * 100) / 100,
  }));

  const storeCount = storeBreakdown.length;
  const storeNames = storeBreakdown.map((s) => s.store);
  const summaryParts = storeBreakdown.map(
    (s) => `${s.store} for ${s.items.length} item${s.items.length > 1 ? "s" : ""}`
  );
  const summary =
    storeCount === 1
      ? `Best plan: all items from ${storeNames[0]}`
      : `Best plan: ${summaryParts.join(", ")}`;

  const savingsMap: Record<Mode, string> = {
    cheapest: "Save $8.12 vs Whole Foods basket",
    cleanest: "Pays $15.44 more than cheapest, but 0 health red flags",
    balanced: "Save $4.27 vs cheapest organic, $9.71 vs full Whole Foods",
  };

  return {
    mode,
    plan: {
      summary,
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalPrediction: {
        direction: avgChange > 1 ? "rising" : avgChange < -1 ? "falling" : "flat",
        percentChange: Math.round(Math.abs(avgChange) * 10) / 10,
        confidence: Math.round(avgConfidence),
        recommendation:
          mode === "cheapest"
            ? "Buy now \u2014 prices trending up across dairy and poultry."
            : mode === "cleanest"
              ? "Organic prices stable. Good time to stock up."
              : "Moderate upward pressure. This basket balances value well.",
      },
      storeBreakdown,
      savings: savingsMap[mode],
    },
    items,
  };
}

// --- Pre-build responses ---

const responses: Record<Mode, CompareBasketResponse> = {
  cheapest: buildResponse("cheapest"),
  cleanest: buildResponse("cleanest"),
  balanced: buildResponse("balanced"),
};

export function getMockBasketResponse(mode: Mode): CompareBasketResponse {
  return responses[mode] ?? responses.balanced;
}
