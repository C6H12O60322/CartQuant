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
    return data.result;
    
  } catch (error: any) {
    console.error(`❌ Failed to call tool:`, error.message);
    return null;
  }
}

function parseStructuredContent(result: any) {
  if (result && result.structuredContent) {
    return result.structuredContent;
  }
  if (result && result.content) {
    const textContent = result.content.find((c: any) => c.type === "text");
    if (textContent) {
      try {
        return JSON.parse(textContent.text);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function testMultiStoreSearch() {
  console.log("🧪 TEST 1: Multi-Store Search");
  console.log("=".repeat(70));
  console.log("Searching for 'almond milk' across 5 stores...\n");
  
  const result = await callMCPTool("search-grocery-products", {
    query: "almond milk",
    stores: ["traderjoes", "target", "wholefoods", "kroger", "costco"]
  });
  
  const data = parseStructuredContent(result);
  
  if (data) {
    console.log(`\n📊 Results Summary:`);
    console.log(`   Total products found: ${data.total_products}`);
    console.log(`   Stores searched: ${data.stores_searched}`);
    
    console.log(`\n🏪 Results by Store:\n`);
    
    Object.entries(data.results).forEach(([storeId, storeData]: [string, any]) => {
      console.log(`   ${storeData.store_name} (${storeData.count} products):`);
      
      if (storeData.error) {
        console.log(`      ⚠️  Error: ${storeData.error}`);
      } else if (storeData.products && storeData.products.length > 0) {
        storeData.products.forEach((product: any, idx: number) => {
          console.log(`      ${idx + 1}. ${product.name}`);
          console.log(`         💰 ${product.price || "N/A"}`);
          if (product.image_url) {
            console.log(`         🖼️  ${product.image_url.substring(0, 50)}...`);
          }
        });
      } else {
        console.log(`      No products found`);
      }
      console.log();
    });
  }
}

async function testSpecificStoreSearch() {
  console.log("\n\n" + "=".repeat(70));
  console.log("🧪 TEST 2: Specific Store Search - Organic Pasta (TJ's, Whole Foods, Costco)");
  console.log("=".repeat(70));
  console.log("Searching for 'organic pasta' in 3 stores...\n");
  
  const result = await callMCPTool("search-grocery-products", {
    query: "organic pasta",
    stores: ["traderjoes", "wholefoods", "costco"]
  });
  
  const data = parseStructuredContent(result);
  
  if (data) {
    console.log(`\n📊 Found ${data.total_products} products across ${data.stores_searched} stores`);
    
    Object.entries(data.results).forEach(([storeId, storeData]: [string, any]) => {
      console.log(`\n   🏬 ${storeData.store_name}: ${storeData.count} products`);
      if (storeData.error) {
        console.log(`      ⚠️  Error: ${storeData.error}`);
      }
    });
  }
}

async function testProductDetails() {
  console.log("\n\n" + "=".repeat(70));
  console.log("🧪 TEST 3: Product Details");
  console.log("=".repeat(70));
  console.log("Getting detailed info for a Trader Joe's product...\n");
  
  const productUrl = "https://www.traderjoes.com/home/products/pdp/organic-papperdelle-pasta-nests-069919";
  
  const result = await callMCPTool("get-product-details", {
    url: productUrl
  });
  
  const data = parseStructuredContent(result);
  
  if (data && data.product) {
    const p = data.product;
    console.log(`\n📦 Product Details:`);
    console.log(`   Name: ${p.name}`);
    console.log(`   Store: ${data.store}`);
    console.log(`   Price: ${p.price || "N/A"}`);
    console.log(`   Category: ${p.category || "N/A"}`);
    
    if (p.description) {
      console.log(`\n   📝 Description:`);
      console.log(`      ${p.description}`);
    }
    
    if (p.ingredients && p.ingredients.length > 0) {
      console.log(`\n   🌾 Ingredients:`);
      p.ingredients.forEach((ing: string) => console.log(`      - ${ing}`));
    }
    
    if (p.nutrition_facts) {
      console.log(`\n   📊 Nutrition Facts:`);
      const nf = p.nutrition_facts;
      if (nf.serving_size) console.log(`      Serving Size: ${nf.serving_size}`);
      if (nf.calories) console.log(`      Calories: ${nf.calories}`);
      if (nf.protein) console.log(`      Protein: ${nf.protein}`);
      if (nf.total_fat) console.log(`      Total Fat: ${nf.total_fat}`);
      if (nf.sodium) console.log(`      Sodium: ${nf.sodium}`);
    }
    
    if (p.allergens && p.allergens.length > 0) {
      console.log(`\n   ⚠️  Allergens:`);
      p.allergens.forEach((a: string) => console.log(`      - ${a}`));
    }
    
    if (p.image_url) {
      console.log(`\n   🖼️  Image: ${p.image_url}`);
    }
  }
}

async function runAllTests() {
  console.log("\n🎯 MULTI-STORE GROCERY SCRAPER TESTS\n");
  
  try {
    await testMultiStoreSearch();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testSpecificStoreSearch();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testProductDetails();
    
    console.log("\n\n" + "=".repeat(70));
    console.log("✅ All tests completed!");
    console.log("=".repeat(70) + "\n");
    
  } catch (error: any) {
    console.error("\n❌ Test suite failed:", error);
  }
}

runAllTests();
