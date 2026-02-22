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

// --- Compare-basket schemas ---

export const modeSchema = z.enum(["cheapest", "cleanest", "balanced"]);
export type Mode = z.infer<typeof modeSchema>;

/**
 * altId convention: deterministic key for each store+product combination.
 * Format: storeName + ":" + productName.toLowerCase().replace(/\s+/g, "-")
 * Example: "Trader Joe's:organic-whole-milk"
 */
export type AltId = string;

/** Signature for the generateAltId helper (implemented in mock-data.ts). */
export type GenerateAltIdFn = (storeName: string, productName: string) => AltId;

export const trendDirection = z.enum(["rising", "falling", "flat"]);
export type TrendDirection = z.infer<typeof trendDirection>;

export const selectedProductSchema = z.object({
  name: z.string(),
  brand: z.string(),
  size: z.string(),
  store: z.string(),
  priceUsd: z.number(),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
});
export type SelectedProduct = z.infer<typeof selectedProductSchema>;

export const healthInfoSchema = z.object({
  score: z.number().min(0).max(100),
  flags: z.array(z.string()).default([]),
  summary: z.string().optional().default(""),
});
export type HealthInfo = z.infer<typeof healthInfoSchema>;

export const predictionInfoSchema = z.object({
  direction: trendDirection.optional().default("flat"),
  percentChange: z.number().optional().default(0),
  confidence: z.number().min(0).max(100).optional().default(50),
  recommendation: z.string().optional().default(""),
});
export type PredictionInfo = z.infer<typeof predictionInfoSchema>;

// A single store's offering for one grocery item
export const itemAlternativeSchema = z.object({
  altId: z.string().optional(),
  product: selectedProductSchema,
  health: healthInfoSchema,
  prediction: predictionInfoSchema,
  ingredients: z.array(z.string()).default([]),
});
export type ItemAlternative = z.infer<typeof itemAlternativeSchema>;

// One grocery item with all store alternatives
export const basketItemWithAltsSchema = z.object({
  query: z.string(),
  alternatives: z.array(itemAlternativeSchema),
});
export type BasketItemWithAlts = z.infer<typeof basketItemWithAltsSchema>;

// A store's contribution to the basket plan
export const storeAssignmentSchema = z.object({
  store: z.string(),
  items: z.array(z.string()),
  subtotalUsd: z.number(),
});
export type StoreAssignment = z.infer<typeof storeAssignmentSchema>;

// Basket-level plan
export const basketPlanSchema = z.object({
  summary: z.string(),
  totalUsd: z.number(),
  totalPrediction: predictionInfoSchema,
  storeBreakdown: z.array(storeAssignmentSchema),
  savings: z.string(),
});
export type BasketPlan = z.infer<typeof basketPlanSchema>;

// Updated top-level response
export const compareBasketResponseSchema = z.object({
  mode: modeSchema,
  plan: basketPlanSchema,
  items: z.array(basketItemWithAltsSchema),
});
export type CompareBasketResponse = z.infer<typeof compareBasketResponseSchema>;

export const compareBasketWidgetPropsSchema = z.object({
  response: compareBasketResponseSchema,
});
export type CompareBasketWidgetProps = z.infer<typeof compareBasketWidgetPropsSchema>;

// --- Legacy single-item schemas (kept for reference) ---

export const basketItemSchema = z.object({
  query: z.string(),
  product: selectedProductSchema,
  health: healthInfoSchema,
  prediction: predictionInfoSchema,
});
export type BasketItem = z.infer<typeof basketItemSchema>;
