import "dotenv/config";
import Firecrawl from "@mendable/firecrawl-js";

export type StoreId = "traderjoes" | "safeway" | "target";

export interface ScrapedProduct {
  name: string;
  url?: string;
  category?: string;
  price?: string;
  image_url?: string;
  description?: string;
  brand?: string;
  store: string;
  store_id: StoreId;
}

export interface StoreSearchResult {
  store_name: string;
  store_id: StoreId;
  count: number;
  products: ScrapedProduct[];
  error?: string;
}

export interface DetailedProduct {
  name?: string;
  price?: string;
  unit_price?: string;
  description?: string;
  image_url?: string;
  additional_images?: string[];
  ingredients?: string[];
  nutrition_facts?: {
    serving_size?: string;
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
  };
  allergens?: string[];
  category?: string;
  brand?: string;
  availability?: string;
  rating?: string;
  review_count?: string;
  upc?: string;
}

interface StoreConfig {
  name: string;
  searchUrl: (query: string) => string;
}

const STORES: Record<StoreId, StoreConfig> = {
  traderjoes: {
    name: "Trader Joe's",
    searchUrl: (q) =>
      `https://www.traderjoes.com/home/search?q=${encodeURIComponent(q)}`,
  },
  safeway: {
    name: "Safeway",
    searchUrl: (q) =>
      `https://www.safeway.com/shop/search-results.html?q=${encodeURIComponent(q)}&tab=products`,
  },
  target: {
    name: "Target",
    searchUrl: (q) =>
      `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  },
};

// Safeway consistently times out (heavy JS / anti-scraping), excluded for now
const ALL_STORE_IDS: StoreId[] = ["traderjoes", "target"];

// Max ms to wait for a single Firecrawl scrape before giving up
const SCRAPE_TIMEOUT_MS = 15_000;

// In-memory cache: key = "storeId:query", value = result + expiry
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  result: StoreSearchResult;
  expiresAt: number;
}

const searchCache = new Map<string, CacheEntry>();

function getCached(storeId: StoreId, query: string): StoreSearchResult | null {
  const key = `${storeId}:${query.toLowerCase().trim()}`;
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(storeId: StoreId, query: string, result: StoreSearchResult): void {
  const key = `${storeId}:${query.toLowerCase().trim()}`;
  searchCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

let firecrawlClient: Firecrawl | null | undefined;

function getClient(): Firecrawl | null {
  if (firecrawlClient !== undefined) return firecrawlClient;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  firecrawlClient = apiKey ? new Firecrawl({ apiKey }) : null;
  return firecrawlClient;
}

export function isScraperConfigured(): boolean {
  return getClient() !== null;
}

export function getStoreName(storeId: StoreId): string {
  return STORES[storeId]?.name ?? storeId;
}

export function getAllStoreIds(): StoreId[] {
  return [...ALL_STORE_IDS];
}

export function detectStoreFromUrl(url: string): StoreId | null {
  if (url.includes("traderjoes.com")) return "traderjoes";
  if (url.includes("safeway.com")) return "safeway";
  if (url.includes("target.com")) return "target";
  return null;
}

const SEARCH_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          url: { type: "string", description: "Full URL to product page" },
          category: { type: "string", description: "Product category" },
          price: { type: "string", description: "Product price including currency symbol" },
          image_url: { type: "string", description: "Product image URL" },
          description: { type: "string", description: "Short product description" },
          brand: { type: "string", description: "Product brand name" },
        },
      },
    },
  },
};

const DETAIL_EXTRACT_SCHEMA = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", description: "Product name" },
    price: { type: "string", description: "Product price" },
    unit_price: { type: "string", description: "Price per unit (e.g., per oz, per lb)" },
    description: { type: "string", description: "Full product description" },
    image_url: { type: "string", description: "Main product image URL" },
    additional_images: {
      type: "array",
      items: { type: "string" },
      description: "Additional product images",
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
        added_sugars: { type: "string" },
        protein: { type: "string" },
      },
      description: "Nutrition facts panel",
    },
    allergens: {
      type: "array",
      items: { type: "string" },
      description: "Allergen information",
    },
    category: { type: "string", description: "Product category" },
    brand: { type: "string", description: "Product brand" },
    availability: { type: "string", description: "Product availability status" },
    rating: { type: "string", description: "Product rating" },
    review_count: { type: "string", description: "Number of reviews" },
    upc: { type: "string", description: "Universal Product Code" },
  },
};

/**
 * Search products in a single store, with cache and timeout.
 */
export async function searchStore(
  query: string,
  storeId: StoreId,
  limit: number = 3
): Promise<StoreSearchResult> {
  const store = STORES[storeId];
  if (!store) {
    return { store_name: storeId, store_id: storeId, count: 0, products: [], error: `Unknown store: ${storeId}` };
  }

  // Cache hit — skip network
  const cached = getCached(storeId, query);
  if (cached) {
    return { ...cached, products: cached.products.slice(0, limit) };
  }

  const client = getClient();
  if (!client) {
    return { store_name: store.name, store_id: storeId, count: 0, products: [], error: "Firecrawl API key not configured" };
  }

  // Race the scrape against a hard timeout
  const scrapePromise = client.scrapeUrl(store.searchUrl(query), {
    formats: ["extract"],
    extract: { schema: SEARCH_EXTRACT_SCHEMA },
    timeout: SCRAPE_TIMEOUT_MS,
  } as any);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${SCRAPE_TIMEOUT_MS / 1000}s`)), SCRAPE_TIMEOUT_MS + 2000)
  );

  try {
    const scrapeResult = await Promise.race([scrapePromise, timeoutPromise]);

    const rawProducts =
      ((scrapeResult as any).extract?.products as any[] | undefined)?.slice(0, limit) || [];

    const products: ScrapedProduct[] = rawProducts.map((p: any) => ({
      name: p.name ?? "",
      url: p.url,
      category: p.category,
      price: p.price,
      image_url: p.image_url,
      description: p.description,
      brand: p.brand,
      store: store.name,
      store_id: storeId,
    }));

    const result: StoreSearchResult = { store_name: store.name, store_id: storeId, count: products.length, products };
    setCache(storeId, query, result);
    return result;
  } catch (err: any) {
    return { store_name: store.name, store_id: storeId, count: 0, products: [], error: `Search failed: ${err.message}` };
  }
}

/**
 * Search products across multiple stores in parallel.
 */
export async function searchAllStores(
  query: string,
  stores: StoreId[] = ALL_STORE_IDS,
  limit: number = 3
): Promise<Record<StoreId, StoreSearchResult>> {
  const results: Partial<Record<StoreId, StoreSearchResult>> = {};

  await Promise.all(
    stores.map(async (storeId) => {
      results[storeId] = await searchStore(query, storeId, limit);
    })
  );

  return results as Record<StoreId, StoreSearchResult>;
}

/**
 * Get detailed product information from a specific product URL.
 */
export async function getProductDetails(
  url: string,
  storeId?: StoreId
): Promise<{ store: string; store_id: StoreId; product: DetailedProduct } | null> {
  const resolvedStoreId = storeId ?? detectStoreFromUrl(url);
  if (!resolvedStoreId) return null;

  const store = STORES[resolvedStoreId];
  if (!store) return null;

  const client = getClient();
  if (!client) return null;

  try {
    const scrapeResult = await client.scrapeUrl(url, {
      formats: ["extract"],
      extract: { schema: DETAIL_EXTRACT_SCHEMA as any },
    } as any);

    const productData = (scrapeResult as any).extract as DetailedProduct | undefined;
    if (!productData || !productData.name) return null;

    return {
      store: store.name,
      store_id: resolvedStoreId,
      product: productData,
    };
  } catch {
    return null;
  }
}
