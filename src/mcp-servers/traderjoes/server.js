import { MCPServer, object, error } from "mcp-use/server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import "dotenv/config";

const DEFAULT_PORT = 3001;
const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
const baseUrl = process.env.MCP_URL || `http://localhost:${port}`;

const server = new MCPServer({
  name: "trader-joes-scraper",
  title: "Trader Joe's Product Scraper",
  version: "1.0.0",
  description: "Scrape Trader Joe's product and category data through Firecrawl",
  baseUrl,
});

const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
const firecrawl = firecrawlApiKey ? new Firecrawl({ apiKey: firecrawlApiKey }) : null;

function requireFirecrawl() {
  if (!firecrawl) {
    return null;
  }
  return firecrawl;
}

function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

server.tool(
  {
    name: "search-traderjoes-products",
    description:
      "Search for Trader Joe's products by name or category. Returns product URLs and basic info.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "Product name or category to search for (example: organic pasta, frozen pizza)"
        ),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return (default: 5)"),
    }),
  },
  async ({ query, limit }) => {
    try {
      const client = requireFirecrawl();
      if (!client) {
        return error(
          "FIRECRAWL_API_KEY is not set. Add it to your environment before using scrape tools."
        );
      }

      const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(query)}`;

      const scrapeResult = await client.v1.scrapeUrl(searchUrl, {
        formats: ["extract"],
        extract: {
          schema: {
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
          },
        },
      });

      const products = scrapeResult.extract?.products?.slice(0, limit) || [];

      return object({
        query,
        count: products.length,
        products,
      });
    } catch (err) {
      return error(`Failed to search Trader Joe's: ${getErrorMessage(err)}`);
    }
  }
);

server.tool(
  {
    name: "scrape-traderjoes-product",
    description:
      "Scrape detailed information from a specific Trader Joe's product page including image, name, ingredients, nutrition facts, price, and description.",
    schema: z.object({
      url: z.string().url().describe("Full URL of the Trader Joe's product page to scrape"),
    }),
  },
  async ({ url }) => {
    try {
      const client = requireFirecrawl();
      if (!client) {
        return error(
          "FIRECRAWL_API_KEY is not set. Add it to your environment before using scrape tools."
        );
      }

      const scrapeResult = await client.v1.scrapeUrl(url, {
        formats: ["extract"],
        extract: {
          schema: {
            type: "object",
            required: ["name"],
            properties: {
              name: {
                type: "string",
                description: "Product name",
              },
              price: {
                type: "string",
                description: "Product price",
              },
              description: {
                type: "string",
                description: "Quick product description",
              },
              image_url: {
                type: "string",
                description: "Main product image URL",
              },
              ingredients: {
                type: "array",
                items: { type: "string" },
                description: "List of ingredients",
              },
              nutrition_facts: {
                type: "object",
                properties: {
                  serving_size: { type: "string" },
                  calories: { type: "string" },
                  total_fat: { type: "string" },
                  saturated_fat: { type: "string" },
                  trans_fat: { type: "string" },
                  cholesterol: { type: "string" },
                  sodium: { type: "string" },
                  total_carbohydrate: { type: "string" },
                  dietary_fiber: { type: "string" },
                  total_sugars: { type: "string" },
                  protein: { type: "string" },
                },
                description: "Nutrition facts panel",
              },
              allergens: {
                type: "array",
                items: { type: "string" },
                description: "Allergen information",
              },
              category: {
                type: "string",
                description: "Product category",
              },
            },
          },
        },
      });

      const productData = scrapeResult.extract;
      if (!productData || !productData.name) {
        return error("Could not extract product data from the page");
      }

      return object({
        success: true,
        product: productData,
        scraped_at: new Date().toISOString(),
        source_url: url,
      });
    } catch (err) {
      return error(`Failed to scrape product: ${getErrorMessage(err)}`);
    }
  }
);

server.tool(
  {
    name: "scrape-traderjoes-category",
    description:
      "Scrape all products from a specific Trader Joe's category page (example: frozen foods, snacks, beverages).",
    schema: z.object({
      category_url: z.string().url().describe("Full URL of the Trader Joe's category page"),
      max_products: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of products to scrape (default: 20)"),
    }),
  },
  async ({ category_url, max_products }) => {
    try {
      const client = requireFirecrawl();
      if (!client) {
        return error(
          "FIRECRAWL_API_KEY is not set. Add it to your environment before using scrape tools."
        );
      }

      const scrapeResult = await client.v1.scrapeUrl(category_url, {
        formats: ["extract"],
        extract: {
          schema: {
            type: "object",
            properties: {
              category_name: { type: "string" },
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    price: { type: "string" },
                    url: { type: "string" },
                    image_url: { type: "string" },
                    quick_description: { type: "string" },
                  },
                },
              },
            },
          },
        },
      });

      const categoryData = scrapeResult.extract;
      const products = categoryData?.products?.slice(0, max_products) || [];

      return object({
        success: true,
        category: categoryData?.category_name || "Unknown",
        product_count: products.length,
        products,
        scraped_at: new Date().toISOString(),
      });
    } catch (err) {
      return error(`Failed to scrape category: ${getErrorMessage(err)}`);
    }
  }
);

console.log(`[traderjoes] Starting MCP server on ${baseUrl}`);
server.listen(port);
console.log("[traderjoes] Server ready");
