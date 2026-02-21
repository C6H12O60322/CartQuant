import { object, type MCPServer } from "mcp-use/server";
import { z } from "zod";
import { searchCatalog } from "../mock-data.js";

export function registerSearchCatalogTool(server: MCPServer): void {
  server.tool(
    {
      name: "search-catalog",
      description:
        "Search CartQuant's small demo catalog (mock data). For live Trader Joe's lookup, use search-traderjoes-products.",
      schema: z.object({
        query: z.string().describe("Search term"),
      }),
    },
    async ({ query }) => {
      const results = searchCatalog(query);
      return object({
        query,
        count: results.length,
        results,
      });
    }
  );
}
