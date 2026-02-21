# CartQuant MCP App Starter

CartQuant is a hackathon starter MCP app built with `mcp-use`.

This repo includes:

- A typed server contract in `server.d.ts`
- A basic MCP server in `index.ts`
- A simple UI widget in `resources/cartquant-plan/widget.tsx`
- Mock data logic so you can demo before wiring real APIs

## 1) Install and run locally

```bash
npm install
npm run dev
```

If `npm run dev` fails on Windows with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, use:

```bash
npm run dev -- --no-hmr --no-open
```

Then use the hosted inspector with auto-connect:

`https://inspector.manufact.com/inspector?autoConnect=http%3A%2F%2Flocalhost%3A3000%2Fmcp`

Standard local inspector route (when available):

`http://localhost:3000/inspector`

## 2) Example prompt in Inspector

Call tool `build-cart-plan` with:

```json
{
  "zipCode": "10001",
  "budgetUsd": 90,
  "maxDistanceMiles": 8,
  "qualityBias": "balanced",
  "items": [
    { "name": "eggs", "quantity": 1 },
    { "name": "whole milk", "quantity": 1 },
    { "name": "sourdough bread", "quantity": 2 }
  ]
}
```

## 3) Deploy to Manufact MCP Cloud

```bash
npm run deploy
```

Set your deployed URL as `MCP_URL` when needed.

## 4) Test in ChatGPT (Developer Mode)

Important constraints from current ChatGPT MCP/app docs:

- Remote servers are required for ChatGPT app/connector tests.
- Localhost MCP servers are not supported directly in ChatGPT.
- `search`/`fetch` tools are not required anymore for connected servers.

Suggested flow:

1. Deploy this server to a remote URL (Manufact cloud or your own host).
2. In ChatGPT web, enable Developer Mode (workspace setting if on Business/Enterprise/Edu).
3. Add your custom MCP app/connector URL in Apps/Connectors.
4. Start a chat and invoke `build-cart-plan`.

## 5) Replace mocks with real APIs

Start by replacing functions in `src/mock-data.ts`:

- Instacart Developer Platform (retailers/products/cart links)
- Kroger Developer APIs (store/product/cart data)
- USDA FoodData Central + Open Food Facts (nutrition/quality enrichment)
- Places/review APIs for store quality signals
- Scraping fallback for stores without APIs (with ToS/robots compliance)
