# MCP Servers

This directory contains additional MCP servers for CartQuant.

## Directory Structure

```text
src/mcp-servers/
  traderjoes/
    server.js
    tests/
      test-client.ts
    README.md
```

## Available Servers

### Trader Joe's Scraper (`traderjoes/`)

Web scraper server that extracts product information using Firecrawl.

- Port: `3001` by default
- Tools:
  - `search-traderjoes-products`
  - `scrape-traderjoes-product`
  - `scrape-traderjoes-category`

## Running

```bash
# from repo root
npm run build
npm run traderjoes:start
```

In a second terminal:

```bash
npm run traderjoes:test
```

## Configuration

Root `mcp.json` defines this server as:

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

## Environment Variables

```bash
FIRECRAWL_API_KEY=your_api_key_here
```
