import { MCPServer, object, text, widget } from "mcp-use/server";
import { z } from "zod";
import { buildCartOptions, getResultById, searchCatalog } from "./src/mock-data.js";
import type { CartPlanInput } from "./server";

const server = new MCPServer({
  name: "cartquant",
  title: "CartQuant",
  version: "0.1.0",
  description:
    "Cart optimization MCP app that compares grocery options using API-first data with scrape fallback",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  websiteUrl: "https://manufact.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

const buildCartPlanSchema = z.object({
  zipCode: z.string().min(5).max(10).describe("Delivery zip code"),
  items: z
    .array(
      z.object({
        name: z.string().describe("User shopping list item"),
        quantity: z.number().int().positive().describe("Desired quantity"),
        unit: z.string().optional().describe("Unit label, example: each, lb, oz"),
        mustBuy: z
          .boolean()
          .optional()
          .describe("If true, item cannot be dropped from recommendations"),
      })
    )
    .min(1)
    .describe("Shopping list"),
  budgetUsd: z.number().positive().describe("Target cart budget in USD"),
  maxDistanceMiles: z
    .number()
    .positive()
    .describe("Maximum acceptable distance for store candidates"),
  qualityBias: z
    .enum(["low_price", "balanced", "high_quality"])
    .describe("How strongly quality score should influence ranking"),
  preferredStores: z
    .array(z.string())
    .optional()
    .describe("Optional store names to prioritize"),
  dietaryTags: z
    .array(z.string())
    .optional()
    .describe("Dietary/ingredient filters to apply later with nutrition APIs"),
});

server.tool(
  {
    name: "build-cart-plan",
    description:
      "Generate three cart options (cheapest, quality-first, best tradeoff) from a shopping list",
    schema: buildCartPlanSchema,
    widget: {
      name: "cartquant-plan",
      invoking: "Building CartQuant options...",
      invoked: "CartQuant options ready",
    },
  },
  async (input) => {
    const typedInput: CartPlanInput = input;
    const options = buildCartOptions(typedInput);
    const cheapest = [...options].sort((left, right) => left.totalUsd - right.totalUsd)[0];

    return widget({
      props: {
        zipCode: typedInput.zipCode,
        generatedAt: new Date().toISOString(),
        preferences: {
          budgetUsd: typedInput.budgetUsd,
          qualityBias: typedInput.qualityBias,
          maxDistanceMiles: typedInput.maxDistanceMiles,
        },
        options,
      },
      output: text(
        `Built ${options.length} plans. Cheapest total is $${cheapest.totalUsd.toFixed(
          2
        )} across ${cheapest.stores.length} store(s).`
      ),
    });
  }
);

server.tool(
  {
    name: "search-catalog",
    description: "Search CartQuant product source catalog entries",
    schema: z.object({
      query: z.string().describe("Search term"),
    }),
  },
  async ({ query }) => {
    const results = searchCatalog(query);
    return object({
      query,
      count: results.length,
      results,
    });
  }
);

server.tool(
  {
    name: "fetch-catalog-entry",
    description: "Fetch detailed source metadata for one catalog result",
    schema: z.object({
      id: z.string().describe("Catalog result id"),
    }),
  },
  async ({ id }) => {
    const result = getResultById(id);

    if (!result) {
      return text(`No catalog entry found for id "${id}".`);
    }

    return object({
      result,
      notes: [
        result.source === "api"
          ? "Official API source with higher reliability."
          : "Fallback scrape source. Treat pricing as estimate until verified.",
      ],
    });
  }
);

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;
server.listen(port);
