# MCP Servers

This directory contains all MCP (Model Context Protocol) servers for the CartQuant project.

## Directory Structure

```
mcp-servers/
├── traderjoes/           # Trader Joe's product scraper
│   ├── server.ts         # Main server implementation
│   ├── tests/
│   │   └── test-client.ts # Test client for the server
│   └── README.md         # Server-specific documentation
└── README.md             # This file
```

## Available Servers

### 1. Trader Joe's Scraper (`traderjoes/`)

A web scraper that extracts product information from Trader Joe's website using Firecrawl.

**Features:**
- Search products by name or category
- Scrape detailed product information (nutrition, ingredients, allergens)
- Scrape entire category pages

**Port:** 3001  
**Documentation:** See `traderjoes/README.md`

## Adding New Servers

When adding a new MCP server to this directory:

1. Create a new directory: `mcp-servers/your-server-name/`
2. Add the server implementation: `server.ts`
3. Create a README: `README.md`
4. Add tests if applicable: `tests/test-client.ts`
5. Update the root `mcp.json` with the new server configuration
6. Add npm scripts in root `package.json` for convenience
7. Update the root `README.md` to document the new server

## Running Servers

All servers are configured in the root `mcp.json` file. To run them:

```bash
# Build the project first
npm run build

# Run individual servers
npm run traderjoes:start

# Run tests
npm run traderjoes:test
```

## Configuration

Server configurations are managed in the root `mcp.json`:

```json
{
  "mcpServers": {
    "cartquant": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "PORT": "3000",
        "MCP_URL": "http://localhost:3000"
      }
    },
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

## Environment Variables

Each server may require specific environment variables. These should be documented in the server's README and added to the root `.env` file:

```bash
# Trader Joe's Scraper
FIRECRAWL_API_KEY=your_api_key_here
```

## Best Practices

1. **Isolation**: Each server should be self-contained in its own directory
2. **Documentation**: Always include a README.md with setup and usage instructions
3. **Testing**: Provide test clients or scripts to verify functionality
4. **Port Management**: Use different ports for each server (3000, 3001, 3002, etc.)
5. **Error Handling**: Implement proper error handling and logging
6. **Type Safety**: Use TypeScript for type safety and better IDE support
