import "dotenv/config";
import Firecrawl from "@mendable/firecrawl-js";
import { error, object, type MCPServer } from "mcp-use/server";
import { z } from "zod";

type TraderJoesProduct = {
  name: string;
  url: string;
  category: string;
  price: string;
};

const productSchema = z.object({
  name: z.string().default("Unknown"),
  url: z.string().default(""),
  category: z.string().default("Unknown"),
  price: z.string().default("N/A"),
});

const firecrawlExtractSchema = {
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
};

let firecrawlClient: Firecrawl | null | undefined;

function getFirecrawlClient(): Firecrawl | null {
  if (firecrawlClient !== undefined) {
    return firecrawlClient;
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  firecrawlClient = apiKey ? new Firecrawl({ apiKey }) : null;
  return firecrawlClient;
}

function normalizeProducts(input: unknown[], limit: number): TraderJoesProduct[] {
  return input.slice(0, limit).map((item) => productSchema.parse(item));
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerSearchTraderJoesProductsTool(server: MCPServer): void {
  server.tool(
    {
      name: "search-traderjoes-products",
      description:
        "Search Trader Joe's live catalog with Firecrawl. Use this for real product lookups such as chocolate, pasta, snacks, and frozen foods.",
      schema: z.object({
        query: z
          .string()
          .describe("Product name or category to search for, e.g. chocolate, organic pasta"),
        limit: z
          .number()
          .int()
          .positive()
          .max(20)
          .optional()
          .default(5)
          .describe("Maximum number of products to return (default: 5, max: 20)"),
      }),
    },
    async ({ query, limit }) => {
      try {
        const client = getFirecrawlClient();
        if (!client) {
          return error(
            "FIRECRAWL_API_KEY is not set. Add it to your environment before using this tool."
          );
        }

        const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(query)}`;
        const scrapeResult = await client.v1.scrapeUrl(searchUrl, {
          formats: ["extract"],
          extract: {
            schema: firecrawlExtractSchema as any,
          },
        });

        if (!scrapeResult.success) {
          return error(
            `Failed to search Trader Joe's: ${scrapeResult.error ?? "Unknown Firecrawl error"}`
          );
        }

        const extractedProducts = scrapeResult.extract?.products ?? [];
        const rawProducts = Array.isArray(extractedProducts) ? extractedProducts : [];
        const products = normalizeProducts(rawProducts, limit);

        return object({
          query,
          count: products.length,
          products,
          source: "traderjoes_firecrawl",
        });
      } catch (err) {
        return error(`Failed to search Trader Joe's: ${getErrorMessage(err)}`);
      }
    }
  );
}
