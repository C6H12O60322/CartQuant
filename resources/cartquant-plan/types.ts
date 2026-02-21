import { z } from "zod";

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
