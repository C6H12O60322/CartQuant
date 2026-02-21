import "dotenv/config";

const MCP_SERVER_URL = "http://localhost:3000/mcp";

async function callMCPTool(toolName: string, args: Record<string, any>) {
  console.log(`\n🔧 Calling tool: ${toolName}`);
  console.log(`📥 Arguments:`, JSON.stringify(args, null, 2));
  
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
          arguments: args
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error(`❌ Error:`, data.error);
      return null;
    }
    
    console.log(`✅ Success!`);
    console.log(`📤 Response:`, JSON.stringify(data.result, null, 2));
    return data.result;
    
  } catch (error: any) {
    console.error(`❌ Failed to call tool:`, error.message);
    return null;
  }
}

async function runTests() {
  console.log("🧪 Starting Trader Joe's MCP Tests...\n");
  console.log("=" .repeat(60));
  
  const testQueries = [
    { name: "Test 1: Chocolate Products", query: "chocolate", limit: 3 },
    { name: "Test 2: Organic Pasta", query: "organic pasta", limit: 3 },
    { name: "Test 3: Frozen Pizza", query: "frozen pizza", limit: 3 }
  ];

  for (const test of testQueries) {
    console.log(`\n\n${"=".repeat(60)}`);
    console.log(`🎯 ${test.name}`);
    console.log("=".repeat(60));
    
    const result = await callMCPTool("search-traderjoes-products", {
      query: test.query,
      limit: test.limit
    });
    
    if (result && result.content) {
      const content = result.content.find((c: any) => c.type === "text");
      if (content) {
        const data = JSON.parse(content.text);
        console.log(`\n📊 Found ${data.count} products for "${data.query}":`);
        
        if (data.products && data.products.length > 0) {
          data.products.forEach((product: any, idx: number) => {
            console.log(`\n   ${idx + 1}. ${product.name || "Unknown"}`);
            console.log(`      💰 Price: ${product.price || "N/A"}`);
            console.log(`      🏷️  Category: ${product.category || "N/A"}`);
            console.log(`      🔗 URL: ${product.url || "N/A"}`);
          });
        } else {
          console.log("   ⚠️  No products found");
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("✅ All tests completed!");
  console.log("=".repeat(60));
}

runTests().catch(console.error);
