import { z } from "zod";

// --- Existing cart plan schemas (kept for backward compat) ---

const quoteSchema = z.object({
  itemName: z.string(),
  quantity: z.number(),
  unitPriceUsd: z.number(),
  lineTotalUsd: z.number(),
  store: z.string(),
  distanceMiles: z.number(),
  qualityScore: z.number(),
  source: z.enum(["api", "scraped"]),
  sourceUrl: z.string(),
});

const optionSchema = z.object({
  strategy: z.enum(["lowest_price", "best_tradeoff", "highest_quality"]),
  totalUsd: z.number(),
  estimatedSavingsUsd: z.number(),
  qualityScore: z.number(),
  avgDistanceMiles: z.number(),
  stores: z.array(z.string()),
  substitutions: z.array(z.string()),
  confidence: z.enum(["api", "mixed", "scraped_estimate"]),
  items: z.array(quoteSchema),
});

export const propSchema = z.object({
  zipCode: z.string(),
  generatedAt: z.string(),
  preferences: z.object({
    budgetUsd: z.number(),
    qualityBias: z.enum(["low_price", "balanced", "high_quality"]),
    maxDistanceMiles: z.number(),
  }),
  options: z.array(optionSchema),
});

export type CartPlanWidgetProps = z.infer<typeof propSchema>;

// --- New compare-basket schemas ---

export const modeSchema = z.enum(["cheapest", "cleanest", "balanced"]);
export type Mode = z.infer<typeof modeSchema>;

export const trendDirection = z.enum(["rising", "falling", "flat"]);
export type TrendDirection = z.infer<typeof trendDirection>;

export const selectedProductSchema = z.object({
  name: z.string(),
  brand: z.string(),
  size: z.string(),
  store: z.string(),
  priceUsd: z.number(),
});
export type SelectedProduct = z.infer<typeof selectedProductSchema>;

export const healthInfoSchema = z.object({
  score: z.number().min(0).max(100),
  flags: z.array(z.string()),
  summary: z.string(),
});
export type HealthInfo = z.infer<typeof healthInfoSchema>;

export const predictionInfoSchema = z.object({
  direction: trendDirection,
  percentChange: z.number(),
  confidence: z.number().min(0).max(100),
  recommendation: z.string(),
});
export type PredictionInfo = z.infer<typeof predictionInfoSchema>;

export const basketItemSchema = z.object({
  query: z.string(),
  product: selectedProductSchema,
  health: healthInfoSchema,
  prediction: predictionInfoSchema,
});
export type BasketItem = z.infer<typeof basketItemSchema>;

export const compareBasketResponseSchema = z.object({
  mode: modeSchema,
  totalUsd: z.number(),
  totalPrediction: predictionInfoSchema,
  recommendation: z.string(),
  savings: z.string(),
  items: z.array(basketItemSchema),
});
export type CompareBasketResponse = z.infer<typeof compareBasketResponseSchema>;

export const compareBasketWidgetPropsSchema = z.object({
  response: compareBasketResponseSchema,
});
export type CompareBasketWidgetProps = z.infer<typeof compareBasketWidgetPropsSchema>;
