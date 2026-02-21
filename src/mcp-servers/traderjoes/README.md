# Trader Joe's Product Scraper MCP Server

This MCP server scrapes Trader Joe's product information using Firecrawl.

## Features

- Search products by keyword/category
- Scrape detailed product pages (ingredients, nutrition, allergens)
- Scrape category pages for multiple products

## Setup

1. Add environment variables in the root `.env`:

```bash
FIRECRAWL_API_KEY=your_api_key_here
```

2. Build from repo root:

```bash
npm run build
```

3. Start the server:

```bash
npm run traderjoes:start
```

The server runs on port `3001` by default (`PORT` env can override).

## Tools

### `search-traderjoes-products`

Input:

- `query` (string): search term
- `limit` (number, optional, default `5`)

### `scrape-traderjoes-product`

Input:

- `url` (string, required): full Trader Joe's product URL

### `scrape-traderjoes-category`

Input:

- `category_url` (string, required): full category URL
- `max_products` (number, optional, default `20`)

## Test Client

Run after the server is up:

```bash
npm run traderjoes:test
```

Optional override if using a non-default endpoint:

```bash
MCP_SERVER_URL=http://localhost:3001/mcp npm run traderjoes:test
```

PowerShell variant:

```powershell
$env:MCP_SERVER_URL="http://localhost:3001/mcp"; npm run traderjoes:test
```

## MCP Config Reference

The root `mcp.json` entry uses:

```json
{
  "mcpServers": {
    "trader-joes-scraper": {
      "command": "node",
      "args": ["dist/src/mcp-servers/traderjoes/server.js"],
      "env": {
        "PORT": "3001",
        "MCP_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Notes

- If `FIRECRAWL_API_KEY` is missing, tools return a clear MCP error message.
- Scraped prices/availability can change by location and time.
