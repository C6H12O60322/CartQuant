# Multi-Store Grocery Scraper MCP Server

An MCP server that scrapes product information from multiple grocery stores (Trader Joe's, Safeway, and Target) using Firecrawl.

## Features

- **Multi-Store Search**: Search for products across Trader Joe's, Safeway, and Target simultaneously
- **Quick Product Overview**: Get top 5 results from each store with superficial info (name, price, image, URL)
- **Detailed Product Info**: Get comprehensive product details including nutrition facts, ingredients, and allergens
- **Flexible Store Selection**: Search in specific stores or all stores at once

## Setup

1. Make sure you have a Firecrawl API key in your `.env` file:
```bash
FIRECRAWL_API_KEY=your_api_key_here
```

2. Build the project from the root directory:
```bash
npm run build
```

3. Run the server:
```bash
node dist/mcp-servers/grocery-scraper/server.js
```

The server will start and connect via MCP protocol.

## Available Tools

### 1. search-grocery-products

Search for grocery products across multiple stores. Returns the top 5 results from each store with basic information.

**Parameters:**
- `query` (string, required): Product name or category to search for (e.g., 'organic pasta', 'frozen pizza', 'almond milk')
- `stores` (array, optional): Which stores to search in. Options: `["traderjoes", "safeway", "target"]`. Default: all stores

**Returns:**
- Query string
- Total products found across all stores
- Number of stores searched
- Results organized by store, each containing:
  - Store name
  - Product count
  - Array of products with: name, price, image_url, url, store, store_id

**Example:**
```json
{
  "query": "organic milk",
  "stores": ["traderjoes", "safeway"]
}
```

**Response Structure:**
```json
{
  "query": "organic milk",
  "total_products": 8,
  "stores_searched": 2,
  "results": {
    "traderjoes": {
      "store_name": "Trader Joe's",
      "count": 4,
      "products": [
        {
          "name": "Organic Whole Milk",
          "price": "$4.99",
          "url": "https://...",
          "image_url": "https://...",
          "store": "Trader Joe's",
          "store_id": "traderjoes"
        }
      ]
    },
    "safeway": {
      "store_name": "Safeway",
      "count": 4,
      "products": [...]
    }
  }
}
```

### 2. get-product-details

Get detailed information about a specific product from any supported store. Use the URL obtained from `search-grocery-products`.

**Parameters:**
- `url` (string, required): Full URL of the product page (from search results)
- `store_id` (string, optional): Store identifier (`traderjoes`, `safeway`, or `target`). Auto-detected from URL if not provided

**Returns:**
- Success status
- Store name and ID
- Comprehensive product data:
  - Basic info: name, price, unit_price, brand, category
  - Images: image_url, additional_images
  - Description: full product description
  - Ingredients: array of ingredients
  - Nutrition facts: complete nutrition panel
  - Allergens: allergen information
  - Availability and rating
  - UPC code
- Timestamp and source URL

**Example:**
```json
{
  "url": "https://www.traderjoes.com/home/products/pdp/organic-pasta-123456"
}
```

**Response Structure:**
```json
{
  "success": true,
  "store": "Trader Joe's",
  "store_id": "traderjoes",
  "product": {
    "name": "Organic Penne Pasta",
    "price": "$2.99",
    "unit_price": "$0.19/oz",
    "description": "Made with organic durum wheat...",
    "image_url": "https://...",
    "ingredients": ["Organic Durum Wheat Semolina", "Water"],
    "nutrition_facts": {
      "serving_size": "2 oz (56g)",
      "calories": "200",
      "total_fat": "1g",
      ...
    },
    "allergens": ["Wheat"],
    "category": "Pasta",
    "brand": "Trader Joe's"
  },
  "scraped_at": "2026-02-21T...",
  "source_url": "https://..."
}
```

## Workflow Example

1. **Search for products across stores:**
```json
{
  "tool": "search-grocery-products",
  "query": "almond butter",
  "stores": ["traderjoes", "safeway", "target"]
}
```

2. **Get detailed info for a specific product:**
```json
{
  "tool": "get-product-details",
  "url": "https://www.traderjoes.com/home/products/pdp/creamy-almond-butter-12345"
}
```

## Testing

Run the test client to verify the server is working:

```bash
# Make sure the server is running first
node dist/mcp-servers/grocery-scraper/server.js

# In another terminal, run the test client
npx tsx src/mcp-servers/grocery-scraper/tests/test-client.ts
```

## Integration with CartQuant

This scraper enhances CartQuant by:

1. **Multi-Store Price Comparison**: Compare prices across Trader Joe's, Safeway, and Target
2. **Cart Optimization**: Find the best deals across multiple stores
3. **Nutrition Information**: Filter products based on dietary requirements
4. **Real-Time Data**: Get current prices and availability
5. **Smart Shopping**: Build optimized shopping lists across stores

## Supported Stores

| Store | Search | Details | Notes |
|-------|--------|---------|-------|
| Trader Joe's | ✅ | ✅ | Full support |
| Safeway | ✅ | ✅ | Full support |
| Target | ✅ | ✅ | Full support |

## Configuration

Update your MCP configuration to use the new server:

```json
{
  "mcpServers": {
    "grocery-scraper": {
      "command": "node",
      "args": ["dist/mcp-servers/grocery-scraper/server.js"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Notes

- This scraper uses Firecrawl's extraction capabilities to parse structured data from web pages
- Rate limiting and ToS compliance are handled by Firecrawl
- The scraper extracts data as it appears on the website at the time of scraping
- Product availability and prices may vary by location and time
- All searches are performed in parallel for optimal performance
- Store detection is automatic based on URL patterns
