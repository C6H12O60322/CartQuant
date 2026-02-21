# Trader Joe's Product Scraper MCP Server

An MCP server that scrapes product information from Trader Joe's website using Firecrawl.

## Features

- **Search Products**: Search for products by name or category
- **Product Details**: Get detailed product information including nutrition facts, ingredients, and allergens
- **Category Scraping**: Scrape all products from a specific category page

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
node dist/mcp-servers/traderjoes/server.js
```

The server will start on port 3001 by default.

## Available Tools

### 1. search-traderjoes-products

Search for Trader Joe's products by name or category.

**Parameters:**
- `query` (string): Product name or category to search for (e.g., 'organic pasta', 'frozen pizza')
- `limit` (number, optional): Maximum number of results to return (default: 5)

**Example:**
```json
{
  "query": "chocolate",
  "limit": 5
}
```

### 2. scrape-traderjoes-product

Scrape detailed information from a specific Trader Joe's product page.

**Parameters:**
- `url` (string): Full URL of the Trader Joe's product page

**Returns:**
- Product name
- Price
- Description
- Image URL
- Ingredients list
- Nutrition facts (serving size, calories, macros, etc.)
- Allergen information
- Category

**Example:**
```json
{
  "url": "https://www.traderjoes.com/home/products/pdp/organic-pasta-123456"
}
```

### 3. scrape-traderjoes-category

Scrape all products from a specific Trader Joe's category page.

**Parameters:**
- `category_url` (string): Full URL of the Trader Joe's category page
- `max_products` (number, optional): Maximum number of products to scrape (default: 20)

**Example:**
```json
{
  "category_url": "https://www.traderjoes.com/home/products/category/frozen-foods",
  "max_products": 10
}
```

## Testing

Run the test client to verify the server is working:

```bash
# Make sure the server is running first
node dist/mcp-servers/traderjoes/server.js

# In another terminal, run the test client
npx tsx mcp-servers/traderjoes/tests/test-client.ts
```

The test client will run several search queries and display the results.

## Integration with CartQuant

This scraper can be used to enhance the CartQuant main server by:

1. Providing real product data from Trader Joe's
2. Enriching cart optimization with actual prices and availability
3. Adding nutrition information for dietary filtering
4. Supporting multi-store cart comparisons

## Configuration

The server is configured in the root `mcp.json`:

```json
{
  "mcpServers": {
    "trader-joes-scraper": {
      "command": "node",
      "args": ["dist/mcp-servers/traderjoes/server.js"],
      "env": {
        "PORT": "3001",
        "MCP_URL": "http://localhost:3001"
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
