import { MCPServer, object, text, widget } from "mcp-use/server";
import { z } from "zod";
import { buildCartOptions, getResultById, searchCatalog } from "./src/mock-data.js";
import { buildCompareBasketResponse } from "./src/services/compare-basket.js";
import { geocodeLocation, findStoresNearby } from "./src/google-maps.js";
import type { BasketMode, CartPlanInput } from "./server";

const server = new MCPServer({
  name: "cartquant",
  title: "CartQuant",
  version: "0.1.0",
  description:
    "Cart optimization MCP app that compares grocery options using API-first data with scrape fallback",
  stateless: true,
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

const compareBasketSchema = z.object({
  items: z
    .array(z.string())
    .min(1)
    .describe("Grocery items to compare (e.g. milk, eggs, bread)"),
  avoid: z
    .array(z.string())
    .optional()
    .describe("Ingredients or flags to avoid (e.g. high sugar, artificial colors)"),
  mode: z
    .enum(["cheapest", "cleanest", "balanced"])
    .default("balanced")
    .describe("Optimization mode: cheapest, cleanest ingredients, or balanced"),
});

server.tool(
  {
    name: "compare-basket",
    description:
      "Compare grocery basket across stores with health scores, ingredient flags, and price predictions",
    schema: compareBasketSchema,
    widget: {
      name: "cartquant-plan",
      invoking: "Comparing basket across stores...",
      invoked: "Basket comparison ready",
    },
  },
  async (input) => {
    const mode = (input.mode || "balanced") as BasketMode;
    const response = await buildCompareBasketResponse({
      items: input.items,
      avoid: input.avoid ?? [],
      mode,
    });

    return widget({
      props: {
        response,
      },
      output: text(
        `Compared ${response.items.length} items in ${mode} mode. Total: $${response.plan.totalUsd.toFixed(
          2
        )}. ${response.plan.summary}`
      ),
    });
  }
);

// ─── Geocoding Tool ───

const geocodeSchema = z.object({
  address: z
    .string()
    .min(1)
    .describe(
      "Address or zip code to geocode (e.g. '94110', 'San Francisco, CA')"
    ),
});

server.tool(
  {
    name: "geocode-location",
    description:
      "Convert an address or zip code to lat/lng coordinates using Google Geocoding API",
    schema: geocodeSchema,
  },
  async ({ address }) => {
    try {
      const result = await geocodeLocation(address);
      return object({
        address,
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
      });
    } catch (err: any) {
      return text(`Geocoding error: ${err.message}`);
    }
  }
);

// ─── Find Stores Nearby Tool ───

const findStoresSchema = z.object({
  lat: z.number().describe("Latitude of the search center"),
  lng: z.number().describe("Longitude of the search center"),
  storeNames: z
    .array(z.string())
    .optional()
    .describe(
      "Store chains to search for (defaults to Trader Joe's, Whole Foods, Safeway, Kroger, Target)"
    ),
  radiusMeters: z
    .number()
    .positive()
    .optional()
    .default(8000)
    .describe("Search radius in meters (default 8000 = ~5 miles)"),
  maxPerStore: z
    .number()
    .int()
    .positive()
    .optional()
    .default(3)
    .describe("Max locations to return per store chain (default 3)"),
});

server.tool(
  {
    name: "find-stores-nearby",
    description:
      "Find real grocery store locations near a point using Google Places API. Returns place IDs, addresses, and coordinates for each store chain.",
    schema: findStoresSchema,
  },
  async (input) => {
    try {
      const radiusMeters = input.radiusMeters ?? 8000;
      const maxPerStore = input.maxPerStore ?? 3;

      const stores = await findStoresNearby(
        input.lat,
        input.lng,
        input.storeNames,
        radiusMeters,
        maxPerStore
      );

      const totalLocations = Object.values(stores).reduce(
        (sum, locs) => sum + locs.length,
        0
      );

      return object({
        center: { lat: input.lat, lng: input.lng },
        radiusMeters,
        stores,
        totalLocations,
      });
    } catch (err: any) {
      return text(`Store search error: ${err.message}`);
    }
  }
);

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;
server.listen(port);
