import type { CompareBasketResponse, Mode } from "./types";

const cheapestResponse: CompareBasketResponse = {
  mode: "cheapest",
  totalUsd: 27.43,
  totalPrediction: {
    direction: "rising",
    percentChange: 3.2,
    confidence: 74,
    recommendation: "Buy now — prices trending up across dairy and poultry.",
  },
  recommendation:
    "Kroger + Aldi split gives best price. Swap cereal brand to save $1.20.",
  savings: "Save $8.12 vs Whole Foods basket",
  items: [
    {
      query: "milk",
      product: {
        name: "Great Value Whole Milk",
        brand: "Great Value",
        size: "1 gal",
        store: "Kroger",
        priceUsd: 3.29,
      },
      health: {
        score: 72,
        flags: ["rBST hormones"],
        summary: "Standard conventional milk, adequate nutrition.",
      },
      prediction: {
        direction: "rising",
        percentChange: 4.1,
        confidence: 81,
        recommendation: "Buy now, dairy prices rising regionally.",
      },
    },
    {
      query: "eggs",
      product: {
        name: "Aldi Cage-Free Eggs",
        brand: "Goldhen",
        size: "12 ct",
        store: "Aldi",
        priceUsd: 3.49,
      },
      health: {
        score: 78,
        flags: ["cage-free"],
        summary: "Cage-free but conventional feed.",
      },
      prediction: {
        direction: "falling",
        percentChange: 2.3,
        confidence: 66,
        recommendation: "Wait if possible, prices softening.",
      },
    },
    {
      query: "cereal",
      product: {
        name: "Malt-O-Meal Fruity Dyno-Bites",
        brand: "Malt-O-Meal",
        size: "32 oz",
        store: "Kroger",
        priceUsd: 3.99,
      },
      health: {
        score: 38,
        flags: ["high sugar", "artificial colors", "BHT preservative"],
        summary: "High sugar cereal with artificial additives.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.4,
        confidence: 88,
        recommendation: "Stable pricing, buy anytime.",
      },
    },
    {
      query: "yogurt",
      product: {
        name: "Great Value Greek Yogurt",
        brand: "Great Value",
        size: "32 oz",
        store: "Kroger",
        priceUsd: 4.28,
      },
      health: {
        score: 68,
        flags: ["added sugar", "natural flavors"],
        summary: "Good protein but has added sweeteners.",
      },
      prediction: {
        direction: "rising",
        percentChange: 1.8,
        confidence: 59,
        recommendation: "Mild upward trend, OK to buy now.",
      },
    },
    {
      query: "bread",
      product: {
        name: "Aldi L'Oven Fresh White Bread",
        brand: "L'Oven Fresh",
        size: "20 oz",
        store: "Aldi",
        priceUsd: 1.89,
      },
      health: {
        score: 45,
        flags: ["high fructose corn syrup", "dough conditioners"],
        summary: "Budget bread with processed ingredients.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.2,
        confidence: 91,
        recommendation: "Price is stable.",
      },
    },
    {
      query: "chicken",
      product: {
        name: "Kroger Boneless Chicken Breast",
        brand: "Kroger",
        size: "3 lb",
        store: "Kroger",
        priceUsd: 10.49,
      },
      health: {
        score: 65,
        flags: ["water added", "sodium solution"],
        summary: "Conventional chicken with added sodium solution.",
      },
      prediction: {
        direction: "rising",
        percentChange: 5.7,
        confidence: 77,
        recommendation: "Buy now, poultry prices rising sharply.",
      },
    },
  ],
};

const cleanestResponse: CompareBasketResponse = {
  mode: "cleanest",
  totalUsd: 42.87,
  totalPrediction: {
    direction: "flat",
    percentChange: 0.8,
    confidence: 70,
    recommendation: "Organic prices stable. Good time to stock up.",
  },
  recommendation:
    "Whole Foods + Trader Joe's for cleanest ingredients. Higher cost but zero red flags.",
  savings: "Pays $15.44 more than cheapest, but 0 health red flags",
  items: [
    {
      query: "milk",
      product: {
        name: "Organic Valley Whole Milk",
        brand: "Organic Valley",
        size: "1 gal",
        store: "Whole Foods",
        priceUsd: 6.49,
      },
      health: {
        score: 95,
        flags: [],
        summary: "Pasture-raised, organic, no hormones or antibiotics.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.3,
        confidence: 85,
        recommendation: "Stable organic dairy pricing.",
      },
    },
    {
      query: "eggs",
      product: {
        name: "Vital Farms Pasture-Raised Eggs",
        brand: "Vital Farms",
        size: "12 ct",
        store: "Whole Foods",
        priceUsd: 7.99,
      },
      health: {
        score: 97,
        flags: [],
        summary: "Pasture-raised, certified humane, no antibiotics.",
      },
      prediction: {
        direction: "falling",
        percentChange: 1.5,
        confidence: 62,
        recommendation: "Slight drop expected, can wait.",
      },
    },
    {
      query: "cereal",
      product: {
        name: "Nature's Path Organic Heritage Flakes",
        brand: "Nature's Path",
        size: "13.25 oz",
        store: "Whole Foods",
        priceUsd: 5.49,
      },
      health: {
        score: 91,
        flags: [],
        summary: "Whole grain, organic, low sugar, no additives.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.1,
        confidence: 90,
        recommendation: "Very stable price.",
      },
    },
    {
      query: "yogurt",
      product: {
        name: "Stonyfield Organic Greek Yogurt",
        brand: "Stonyfield",
        size: "32 oz",
        store: "Whole Foods",
        priceUsd: 6.29,
      },
      health: {
        score: 88,
        flags: ["added sugar"],
        summary: "Organic with live cultures, minimal sugar added.",
      },
      prediction: {
        direction: "rising",
        percentChange: 2.1,
        confidence: 55,
        recommendation: "Slight increase likely, buy soon.",
      },
    },
    {
      query: "bread",
      product: {
        name: "Dave's Killer Bread 21 Whole Grains",
        brand: "Dave's Killer Bread",
        size: "27 oz",
        store: "Trader Joe's",
        priceUsd: 5.99,
      },
      health: {
        score: 86,
        flags: [],
        summary: "Organic whole grains, high fiber, no HFCS.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.5,
        confidence: 83,
        recommendation: "Stable pricing.",
      },
    },
    {
      query: "chicken",
      product: {
        name: "Bell & Evans Air Chilled Chicken Breast",
        brand: "Bell & Evans",
        size: "2 lb",
        store: "Whole Foods",
        priceUsd: 10.62,
      },
      health: {
        score: 93,
        flags: [],
        summary: "Air chilled, no antibiotics, no added solutions.",
      },
      prediction: {
        direction: "rising",
        percentChange: 3.9,
        confidence: 72,
        recommendation: "Organic poultry rising, buy now.",
      },
    },
  ],
};

const balancedResponse: CompareBasketResponse = {
  mode: "balanced",
  totalUsd: 33.16,
  totalPrediction: {
    direction: "rising",
    percentChange: 1.9,
    confidence: 71,
    recommendation: "Moderate upward pressure. This basket balances value well.",
  },
  recommendation:
    "Trader Joe's heavy basket — good ingredients at fair prices. One swap for cereal.",
  savings: "Save $4.27 vs cheapest organic, $9.71 vs full Whole Foods",
  items: [
    {
      query: "milk",
      product: {
        name: "Trader Joe's Organic Whole Milk",
        brand: "Trader Joe's",
        size: "1 gal",
        store: "Trader Joe's",
        priceUsd: 4.49,
      },
      health: {
        score: 88,
        flags: [],
        summary: "Organic, no hormones, good value.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.6,
        confidence: 79,
        recommendation: "Stable price, buy anytime.",
      },
    },
    {
      query: "eggs",
      product: {
        name: "Trader Joe's Free Range Eggs",
        brand: "Trader Joe's",
        size: "12 ct",
        store: "Trader Joe's",
        priceUsd: 4.99,
      },
      health: {
        score: 83,
        flags: [],
        summary: "Free range, no antibiotics.",
      },
      prediction: {
        direction: "falling",
        percentChange: 1.8,
        confidence: 64,
        recommendation: "Prices easing, can wait a few days.",
      },
    },
    {
      query: "cereal",
      product: {
        name: "Trader Joe's Organic O's",
        brand: "Trader Joe's",
        size: "14 oz",
        store: "Trader Joe's",
        priceUsd: 3.29,
      },
      health: {
        score: 82,
        flags: ["added sugar"],
        summary: "Organic with modest sugar, no artificial ingredients.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.3,
        confidence: 87,
        recommendation: "Stable.",
      },
    },
    {
      query: "yogurt",
      product: {
        name: "Trader Joe's Greek Yogurt",
        brand: "Trader Joe's",
        size: "32 oz",
        store: "Trader Joe's",
        priceUsd: 4.99,
      },
      health: {
        score: 80,
        flags: ["natural flavors"],
        summary: "Good protein, minimal additives.",
      },
      prediction: {
        direction: "rising",
        percentChange: 1.4,
        confidence: 61,
        recommendation: "Mild increase, fine to buy now.",
      },
    },
    {
      query: "bread",
      product: {
        name: "Trader Joe's Whole Wheat Bread",
        brand: "Trader Joe's",
        size: "24 oz",
        store: "Trader Joe's",
        priceUsd: 3.49,
      },
      health: {
        score: 79,
        flags: [],
        summary: "Whole wheat, no HFCS, short ingredient list.",
      },
      prediction: {
        direction: "flat",
        percentChange: 0.2,
        confidence: 89,
        recommendation: "Very stable.",
      },
    },
    {
      query: "chicken",
      product: {
        name: "Trader Joe's All Natural Chicken Breast",
        brand: "Trader Joe's",
        size: "2.5 lb",
        store: "Trader Joe's",
        priceUsd: 11.91,
      },
      health: {
        score: 81,
        flags: ["water added"],
        summary: "No antibiotics, minimal processing. Some water retained.",
      },
      prediction: {
        direction: "rising",
        percentChange: 4.2,
        confidence: 75,
        recommendation: "Poultry trending up, buy now.",
      },
    },
  ],
};

const responses: Record<Mode, CompareBasketResponse> = {
  cheapest: cheapestResponse,
  cleanest: cleanestResponse,
  balanced: balancedResponse,
};

export function getMockBasketResponse(mode: Mode): CompareBasketResponse {
  return responses[mode];
}

export const DEMO_ITEMS = ["milk", "eggs", "cereal", "yogurt", "bread", "chicken"];
