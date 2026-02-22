import { MCPServer, text, object, error, widget } from "mcp-use/server";
import { z } from "zod";
import Firecrawl from "@mendable/firecrawl-js";
import "dotenv/config";

const server = new MCPServer({
  name: "grocery-scraper",
  title: "Multi-Store Grocery Scraper",
  version: "2.1.0",
});

const firecrawl = new Firecrawl({ 
  apiKey: process.env.FIRECRAWL_API_KEY 
});

// Types
type StoreId = "traderjoes" | "target" | "wholefoods" | "kroger" | "costco";

interface Product {
  name?: string;
  url?: string;
  category?: string;
  price?: string;
  image_url?: string;
  store?: string;
  store_id?: StoreId;
}

interface StoreConfig {
  name: string;
  searchUrl: (query: string) => string;
}

interface StoreResult {
  store_name: string;
  count: number;
  products: Product[];
  error?: string;
}

interface NutritionFacts {
  serving_size?: string;
  servings_per_container?: string;
  calories?: string;
  total_fat?: string;
  saturated_fat?: string;
  trans_fat?: string;
  cholesterol?: string;
  sodium?: string;
  total_carbohydrate?: string;
  dietary_fiber?: string;
  total_sugars?: string;
  added_sugars?: string;
  protein?: string;
  vitamin_d?: string;
  calcium?: string;
  iron?: string;
  potassium?: string;
}

interface ProductDetails {
  name?: string;
  price?: string;
  unit_price?: string;
  description?: string;
  image_url?: string;
  additional_images?: string[];
  ingredients?: string[];
  nutrition_facts?: NutritionFacts;
  allergens?: string[];
  category?: string;
  brand?: string;
  availability?: string;
  rating?: string;
  review_count?: string;
  upc?: string;
}

// Store configurations
const STORES: Record<StoreId, StoreConfig> = {
  traderjoes: {
    name: "Trader Joe's",
    searchUrl: (query: string) => `https://www.traderjoes.com/home/search?q=${encodeURIComponent(query)}`,
  },
  target: {
    name: "Target",
    searchUrl: (query: string) => `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`,
  },
  wholefoods: {
    name: "Whole Foods",
    searchUrl: (query: string) => `https://www.wholefoodsmarket.com/search?text=${encodeURIComponent(query)}`,
  },
  kroger: {
    name: "Kroger",
    searchUrl: (query: string) => `https://www.kroger.com/search?query=${encodeURIComponent(query)}`,
  },
  costco: {
    name: "Costco",
    searchUrl: (query: string) => `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(query)}`,
  },
};

/**
 * Tool 1: Search products across multiple stores
 * Returns top 5 results from each store with superficial info
 */
server.tool(
  {
    name: "search-grocery-products",
    description: "Search for grocery products across Trader Joe's, Target, Whole Foods, Kroger, and Costco. Returns the top 3 results from each store with basic product information (name, price, image, URL).",
    schema: z.object({
      query: z.string().describe("Product name or category to search for (e.g., 'organic pasta', 'frozen pizza', 'almond milk')"),
      stores: z
        .array(z.enum(["traderjoes", "target", "wholefoods", "kroger", "costco"]))
        .optional()
        .default(["traderjoes", "target", "wholefoods", "kroger", "costco"])
        .describe("Which stores to search in (default: all supported stores)")
    }),
  },
  async ({ query, stores }) => {
    try {
      const results: Record<StoreId, StoreResult> = {} as Record<StoreId, StoreResult>;
      const searchPromises: Promise<void>[] = [];

      // Search in each selected store
      for (const storeId of stores) {
        const store = STORES[storeId];
        if (!store) continue;

        const searchPromise = (async () => {
          try {
            const searchUrl = store.searchUrl(query);
            
            const scrapeResult = await firecrawl.v1.scrapeUrl(searchUrl, {
              formats: ['extract'],
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
                          image_url: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            } as any);

            const products = ((scrapeResult as any).extract?.products as Product[] | undefined)?.slice(0, 3) || [];
            
            // Add store identifier to each product
            const productsWithStore: Product[] = products.map(p => ({
              ...p,
              store: store.name,
              store_id: storeId
            }));

            results[storeId] = {
              store_name: store.name,
              count: productsWithStore.length,
              products: productsWithStore
            };
          } catch (err: any) {
            results[storeId] = {
              store_name: store.name,
              error: `Failed to search: ${err.message}`,
              count: 0,
              products: []
            };
          }
        })();

        searchPromises.push(searchPromise);
      }

      // Wait for all searches to complete
      await Promise.all(searchPromises);

      // Calculate totals
      const totalProducts = Object.values(results).reduce((sum, r) => sum + r.count, 0);

      return object({
        query,
        total_products: totalProducts,
        stores_searched: stores.length,
        results,
        searched_at: new Date().toISOString()
      });
      
    } catch (err: any) {
      return error(`Failed to search grocery products: ${err.message}`);
    }
  }
);

/**
 * Tool 2: Get detailed product information
 * Takes a product URL and returns comprehensive details
 */
server.tool(
  {
    name: "get-product-details",
    description: "Get detailed information about a specific product from any supported store. Requires the product URL obtained from search-grocery-products. Returns comprehensive details including ingredients, nutrition facts, allergens, and full description.",
    schema: z.object({
      url: z.string().url().describe("Full URL of the product page (from search-grocery-products results)"),
      store_id: z
        .enum(["traderjoes", "target", "wholefoods", "kroger", "costco"])
        .optional()
        .describe("Store identifier to optimize scraping (optional, will be auto-detected from URL)")
    }),
  },
  async ({ url, store_id }) => {
    try {
      // Auto-detect store from URL if not provided
      if (!store_id) {
        if (url.includes('traderjoes.com')) store_id = 'traderjoes';
        else if (url.includes('target.com')) store_id = 'target';
        else if (url.includes('wholefoodsmarket.com')) store_id = 'wholefoods';
        else if (url.includes('kroger.com')) store_id = 'kroger';
        else if (url.includes('costco.com')) store_id = 'costco';
        else {
          return error("Could not detect store from URL. Please provide store_id parameter.");
        }
      }

      const store = STORES[store_id];
      if (!store) {
        return error(`Invalid store_id: ${store_id}`);
      }

      // Define comprehensive schema for detailed product info
      const detailedSchema = {
        type: "object",
        required: ["name"],
        properties: {
          name: {
            type: "string",
            description: "Product name"
          },
          price: {
            type: "string",
            description: "Product price"
          },
          unit_price: {
            type: "string",
            description: "Price per unit (e.g., per oz, per lb)"
          },
          description: {
            type: "string",
            description: "Full product description"
          },
          image_url: {
            type: "string",
            description: "Main product image URL"
          },
          additional_images: {
            type: "array",
            items: { type: "string" },
            description: "Additional product images"
          },
          ingredients: {
            type: "array",
            items: { type: "string" },
            description: "List of ingredients"
          },
          nutrition_facts: {
            type: "object",
            properties: {
              serving_size: { type: "string" },
              servings_per_container: { type: "string" },
              calories: { type: "string" },
              total_fat: { type: "string" },
              saturated_fat: { type: "string" },
              trans_fat: { type: "string" },
              cholesterol: { type: "string" },
              sodium: { type: "string" },
              total_carbohydrate: { type: "string" },
              dietary_fiber: { type: "string" },
              total_sugars: { type: "string" },
              added_sugars: { type: "string" },
              protein: { type: "string" },
              vitamin_d: { type: "string" },
              calcium: { type: "string" },
              iron: { type: "string" },
              potassium: { type: "string" }
            },
            description: "Nutrition facts panel"
          },
          allergens: {
            type: "array",
            items: { type: "string" },
            description: "Allergen information"
          },
          category: {
            type: "string",
            description: "Product category"
          },
          brand: {
            type: "string",
            description: "Product brand"
          },
          availability: {
            type: "string",
            description: "Product availability status"
          },
          rating: {
            type: "string",
            description: "Product rating"
          },
          review_count: {
            type: "string",
            description: "Number of reviews"
          },
          upc: {
            type: "string",
            description: "Universal Product Code"
          }
        }
      };

      const scrapeResult = await firecrawl.v1.scrapeUrl(url, {
        formats: ['extract'],
        extract: {
          schema: detailedSchema as any
        }
      } as any);

      const productData = (scrapeResult as any).extract as ProductDetails | undefined;
      
      if (!productData || !productData.name) {
        return error("Could not extract product data from the page. The page may have changed or the product may no longer be available.");
      }

      return object({
        success: true,
        store: store.name,
        store_id: store_id,
        product: productData,
        scraped_at: new Date().toISOString(),
        source_url: url
      });
      
    } catch (err: any) {
      return error(`Failed to scrape product details: ${err.message}`);
    }
  }
);

/**
 * Legacy tool for backward compatibility
 * @deprecated Use search-grocery-products instead
 */
server.tool(
  {
    name: "search-traderjoes-products",
    description: "[DEPRECATED] Use search-grocery-products instead. This tool only searches Trader Joe's.",
    schema: z.object({
      query: z.string(),
      limit: z.number().optional().default(3)
    }),
  },
  async ({ query, limit }) => {
    try {
      const searchUrl = `https://www.traderjoes.com/home/search?q=${encodeURIComponent(query)}`;
      
      const scrapeResult = await firecrawl.v1.scrapeUrl(searchUrl, {
        formats: ['extract'],
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
                    price: { type: "string" }
                  }
                }
              }
            }
          }
        }
      } as any);

      const products = ((scrapeResult as any).extract?.products as Product[] | undefined)?.slice(0, limit) || [];
      
      return object({
        query,
        count: products.length,
        products,
        notice: "This tool is deprecated. Please use 'search-grocery-products' for multi-store search."
      });
      
    } catch (err: any) {
      return error(`Failed to search Trader Joe's: ${err.message}`);
    }
  }
);

console.log("Multi-Store Grocery Scraper MCP Server starting...");
console.log("Supported stores: Trader Joe's, Target, Whole Foods, Kroger, Costco");
server.listen();
console.log("Server ready! Connect via MCP client.");


