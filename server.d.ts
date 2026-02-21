export type QualityBias = "low_price" | "balanced" | "high_quality";

export type DataConfidence = "api" | "mixed" | "scraped_estimate";

export type CartStrategy = "lowest_price" | "best_tradeoff" | "highest_quality";

export interface CartLineItem {
  name: string;
  quantity: number;
  unit?: string;
  mustBuy?: boolean;
}

export interface CartPlanInput {
  zipCode: string;
  items: CartLineItem[];
  budgetUsd: number;
  maxDistanceMiles: number;
  qualityBias: QualityBias;
  preferredStores?: string[];
  dietaryTags?: string[];
}

export interface RankedStoreQuote {
  itemName: string;
  quantity: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
  store: string;
  distanceMiles: number;
  qualityScore: number;
  source: "api" | "scraped";
  sourceUrl: string;
}

export interface CartOption {
  strategy: CartStrategy;
  totalUsd: number;
  estimatedSavingsUsd: number;
  qualityScore: number;
  avgDistanceMiles: number;
  stores: string[];
  substitutions: string[];
  confidence: DataConfidence;
  items: RankedStoreQuote[];
}

export interface CartPlanWidgetProps {
  zipCode: string;
  generatedAt: string;
  preferences: {
    budgetUsd: number;
    qualityBias: QualityBias;
    maxDistanceMiles: number;
  };
  options: CartOption[];
}

export interface SearchResultItem {
  id: string;
  title: string;
  snippet: string;
  url: string;
  source: "api" | "scraped";
}

// --- Compare Basket types ---

export type BasketMode = "cheapest" | "cleanest" | "balanced";

export type TrendDirection = "rising" | "falling" | "flat";

export interface SelectedProduct {
  name: string;
  brand: string;
  size: string;
  store: string;
  priceUsd: number;
}

export interface HealthInfo {
  score: number;
  flags: string[];
  summary: string;
}

export interface PredictionInfo {
  direction: TrendDirection;
  percentChange: number;
  confidence: number;
  recommendation: string;
}

export interface BasketItem {
  query: string;
  product: SelectedProduct;
  health: HealthInfo;
  prediction: PredictionInfo;
}

export interface CompareBasketResponse {
  mode: BasketMode;
  totalUsd: number;
  totalPrediction: PredictionInfo;
  recommendation: string;
  savings: string;
  items: BasketItem[];
}
