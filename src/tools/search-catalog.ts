import { object, type MCPServer } from "mcp-use/server";
import { z } from "zod";
import { searchCatalog } from "../mock-data.js";

export function registerSearchCatalogTool(server: MCPServer): void {
  server.tool(
    {
      name: "search-catalog",
      description: "Search CartQuant product source catalog entries",
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
