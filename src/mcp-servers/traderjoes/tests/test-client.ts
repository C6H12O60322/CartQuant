import "dotenv/config";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? "http://localhost:3001/mcp";

type ToolContent = {
  type: string;
  text?: string;
};

type ToolCallResult = {
  content?: ToolContent[];
  isError?: boolean;
  structuredContent?: unknown;
};

async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolCallResult | null> {
  console.log(`\n[call] ${toolName}`);
  console.log(`[args] ${JSON.stringify(args, null, 2)}`);

  try {
    const response = await fetch(MCP_SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error("[rpc-error]", data.error);
      return null;
    }

    const result = data.result as ToolCallResult;
    if (result.isError) {
      const message = result.content?.find((c) => c.type === "text")?.text ?? "Unknown tool error";
      console.error(`[tool-error] ${message}`);
    } else {
      console.log("[ok] Tool call completed");
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[failed] ${message}`);
    return null;
  }
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runTests() {
  console.log("[test] Starting Trader Joe's MCP tests");
  console.log(`[test] Server URL: ${MCP_SERVER_URL}`);
  console.log("=".repeat(60));

  const testQueries = [
    { name: "Chocolate Products", query: "chocolate", limit: 3 },
    { name: "Organic Pasta", query: "organic pasta", limit: 3 },
    { name: "Frozen Pizza", query: "frozen pizza", limit: 3 },
  ];

  for (const test of testQueries) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[case] ${test.name}`);
    console.log("=".repeat(60));

    const result = await callMCPTool("search-traderjoes-products", {
      query: test.query,
      limit: test.limit,
    });

    if (!result) {
      continue;
    }

    const textPayload = result.content?.find((c) => c.type === "text")?.text;
    if (!textPayload) {
      console.log("[info] No text payload returned");
      continue;
    }

    const parsed = tryParseJson(textPayload) as
      | { query?: string; count?: number; products?: Array<{ name?: string; price?: string; category?: string; url?: string }> }
      | null;

    if (!parsed) {
      console.log(`[raw] ${textPayload}`);
      continue;
    }

    const count = parsed.count ?? 0;
    const query = parsed.query ?? test.query;
    console.log(`[result] Found ${count} products for "${query}"`);

    if (!parsed.products || parsed.products.length === 0) {
      console.log("[result] No products found");
      continue;
    }

    parsed.products.forEach((product, idx) => {
      console.log(`\n  ${idx + 1}. ${product.name ?? "Unknown"}`);
      console.log(`     Price: ${product.price ?? "N/A"}`);
      console.log(`     Category: ${product.category ?? "N/A"}`);
      console.log(`     URL: ${product.url ?? "N/A"}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("[test] Completed");
  console.log("=".repeat(60));
}

runTests().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fatal] ${message}`);
});
