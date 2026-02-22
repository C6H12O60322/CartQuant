import "dotenv/config";
import { buildCompareBasketResponse } from "../services/compare-basket.js";
import {
  searchAllStores,
  getProductDetails,
  isScraperConfigured,
  detectStoreFromUrl,
  type StoreId,
} from "../services/grocery-scraper.js";
import type { ItemAlternative, CompareBasketResponse, Mode } from "../../resources/cartquant-plan/types.js";

const DIVIDER = "═".repeat(80);
const THIN_DIVIDER = "─".repeat(80);

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function printAlt(alt: ItemAlternative, idx: number) {
  const rec = idx === 0 ? " ★ RECOMMENDED" : "";
  console.log(`  ${idx + 1}. ${alt.product.store}${rec}`);
  console.log(`     Name:        ${alt.product.name}`);
  console.log(`     Brand:       ${alt.product.brand}`);
  console.log(`     Price:       ${formatUsd(alt.product.priceUsd)}`);
  console.log(`     Image URL:   ${alt.product.imageUrl ?? "(none)"}`);
  console.log(`     Description: ${alt.product.description ?? "(none)"}`);
  console.log(`     Product URL: ${alt.product.url ?? "(none)"}`);
  console.log(`     Health:      ${alt.health.score}/100 — ${alt.health.summary}`);
  if (alt.health.flags.length > 0) {
    console.log(`     Flags:       ${alt.health.flags.join(", ")}`);
  }
  console.log(
    `     Prediction:  ${alt.prediction.direction} ${alt.prediction.percentChange}% (conf: ${alt.prediction.confidence}%)`
  );
  console.log(`     Tip:         ${alt.prediction.recommendation}`);
}

function printBasketResponse(response: CompareBasketResponse) {
  console.log(`\n${DIVIDER}`);
  console.log(`  MODE: ${response.mode.toUpperCase()}`);
  console.log(DIVIDER);

  console.log(`\n  PLAN SUMMARY`);
  console.log(`  ${response.plan.summary}`);
  console.log(`  Total: ${formatUsd(response.plan.totalUsd)}`);
  console.log(`  Savings: ${response.plan.savings}`);
  console.log(
    `  Prediction: ${response.plan.totalPrediction.direction} ${response.plan.totalPrediction.percentChange}% (conf: ${response.plan.totalPrediction.confidence}%)`
  );
  console.log(`  Tip: ${response.plan.totalPrediction.recommendation}`);

  console.log(`\n  STORE BREAKDOWN`);
  for (const sb of response.plan.storeBreakdown) {
    console.log(`    ${sb.store}: ${sb.items.join(", ")} → ${formatUsd(sb.subtotalUsd)}`);
  }

  for (const item of response.items) {
    console.log(`\n${THIN_DIVIDER}`);
    console.log(`  ITEM: "${item.query}" — ${item.alternatives.length} alternatives`);
    console.log(THIN_DIVIDER);
    for (let i = 0; i < item.alternatives.length; i++) {
      printAlt(item.alternatives[i], i);
      if (i < item.alternatives.length - 1) console.log();
    }
  }
}

// ── Tests ──

async function testScraperDirect() {
  console.log("\n\n" + DIVIDER);
  console.log("  TEST 1: Direct Scraper — searchAllStores('almond milk')");
  console.log(DIVIDER);
  console.log(`  Firecrawl configured: ${isScraperConfigured()}\n`);

  const results = await searchAllStores("almond milk", ["traderjoes", "safeway", "target"], 2);

  for (const [storeId, result] of Object.entries(results)) {
    console.log(`  ${result.store_name} (${storeId}): ${result.count} products`);
    if (result.error) {
      console.log(`    ERROR: ${result.error}`);
    }
    for (const p of result.products) {
      console.log(`    • ${p.name}`);
      console.log(`      Price: ${p.price ?? "(none)"}`);
      console.log(`      Brand: ${p.brand ?? "(none)"}`);
      console.log(`      Image: ${p.image_url ? p.image_url.substring(0, 80) + "..." : "(none)"}`);
      console.log(`      Desc:  ${p.description ? p.description.substring(0, 100) + "..." : "(none)"}`);
      console.log(`      URL:   ${p.url ? p.url.substring(0, 80) + "..." : "(none)"}`);
    }
    console.log();
  }
}

async function testCompareBasket(mode: Mode, items: string[]) {
  console.log("\n\n" + DIVIDER);
  console.log(`  TEST: compare-basket — mode="${mode}", items=[${items.join(", ")}]`);
  console.log(DIVIDER);

  const start = Date.now();
  const response = await buildCompareBasketResponse({ items, mode });
  const elapsed = Date.now() - start;

  printBasketResponse(response);

  console.log(`\n  (completed in ${(elapsed / 1000).toFixed(1)}s)`);
  return response;
}

async function testProductDetails(response: CompareBasketResponse) {
  const firstItemWithUrl = response.items
    .flatMap((i) => i.alternatives)
    .find((alt) => alt.product.url);

  if (!firstItemWithUrl) {
    console.log("\n\n  SKIP: No product URLs found — cannot test get-product-details");
    return;
  }

  const url = firstItemWithUrl.product.url!;
  const storeId = detectStoreFromUrl(url);

  console.log("\n\n" + DIVIDER);
  console.log("  TEST: get-product-details");
  console.log(DIVIDER);
  console.log(`  URL: ${url}`);
  console.log(`  Store: ${storeId ?? "auto-detect"}\n`);

  const start = Date.now();
  const result = await getProductDetails(url, storeId ?? undefined);
  const elapsed = Date.now() - start;

  if (!result) {
    console.log("  RESULT: null (scraping failed or no data extracted)");
  } else {
    const p = result.product;
    console.log(`  Name:          ${p.name}`);
    console.log(`  Price:         ${p.price ?? "(none)"}`);
    console.log(`  Unit Price:    ${p.unit_price ?? "(none)"}`);
    console.log(`  Brand:         ${p.brand ?? "(none)"}`);
    console.log(`  Category:      ${p.category ?? "(none)"}`);
    console.log(`  Description:   ${p.description ? p.description.substring(0, 120) + "..." : "(none)"}`);
    console.log(`  Image:         ${p.image_url ? p.image_url.substring(0, 80) + "..." : "(none)"}`);
    console.log(`  Availability:  ${p.availability ?? "(none)"}`);
    console.log(`  Rating:        ${p.rating ?? "(none)"} (${p.review_count ?? "?"} reviews)`);
    if (p.ingredients && p.ingredients.length > 0) {
      console.log(`  Ingredients:   ${p.ingredients.slice(0, 5).join(", ")}${p.ingredients.length > 5 ? "..." : ""}`);
    }
    if (p.allergens && p.allergens.length > 0) {
      console.log(`  Allergens:     ${p.allergens.join(", ")}`);
    }
    if (p.nutrition_facts) {
      const nf = p.nutrition_facts;
      console.log(`  Nutrition:     ${nf.calories ?? "?"} cal | Fat: ${nf.total_fat ?? "?"} | Protein: ${nf.protein ?? "?"} | Carbs: ${nf.total_carbohydrate ?? "?"}`);
    }
  }

  console.log(`\n  (completed in ${(elapsed / 1000).toFixed(1)}s)`);
}

async function testWidgetDataShape(response: CompareBasketResponse) {
  console.log("\n\n" + DIVIDER);
  console.log("  WIDGET DATA VALIDATION");
  console.log(DIVIDER);

  let issues = 0;

  if (!response.mode) { console.log("  ❌ Missing: response.mode"); issues++; }
  if (!response.plan) { console.log("  ❌ Missing: response.plan"); issues++; }
  if (!response.items || response.items.length === 0) { console.log("  ❌ Missing: response.items"); issues++; }

  if (response.plan) {
    if (!response.plan.summary) { console.log("  ❌ Missing: plan.summary"); issues++; }
    if (typeof response.plan.totalUsd !== "number") { console.log("  ❌ Missing: plan.totalUsd"); issues++; }
    if (!response.plan.storeBreakdown || response.plan.storeBreakdown.length === 0) {
      console.log("  ❌ Missing: plan.storeBreakdown"); issues++;
    }
    if (!response.plan.totalPrediction) { console.log("  ❌ Missing: plan.totalPrediction"); issues++; }
  }

  let altsWithImage = 0;
  let altsWithDesc = 0;
  let altsWithUrl = 0;
  let totalAlts = 0;

  for (const item of response.items) {
    if (!item.query) { console.log("  ❌ Item missing query"); issues++; }
    if (!item.alternatives || item.alternatives.length === 0) {
      console.log(`  ❌ Item "${item.query}" has 0 alternatives`); issues++;
    }
    for (const alt of item.alternatives) {
      totalAlts++;
      if (!alt.product?.name) { console.log(`  ❌ Alt missing product.name in "${item.query}"`); issues++; }
      if (!alt.product?.store) { console.log(`  ❌ Alt missing product.store in "${item.query}"`); issues++; }
      if (typeof alt.product?.priceUsd !== "number") { console.log(`  ❌ Alt missing priceUsd in "${item.query}"`); issues++; }
      if (!alt.health) { console.log(`  ❌ Alt missing health in "${item.query}"`); issues++; }
      if (!alt.prediction) { console.log(`  ❌ Alt missing prediction in "${item.query}"`); issues++; }
      if (alt.product?.imageUrl) altsWithImage++;
      if (alt.product?.description) altsWithDesc++;
      if (alt.product?.url) altsWithUrl++;
    }
  }

  console.log(`\n  Total items:        ${response.items.length}`);
  console.log(`  Total alternatives: ${totalAlts}`);
  console.log(`  With image URL:     ${altsWithImage}/${totalAlts} (${Math.round(altsWithImage/totalAlts*100)}%)`);
  console.log(`  With description:   ${altsWithDesc}/${totalAlts} (${Math.round(altsWithDesc/totalAlts*100)}%)`);
  console.log(`  With product URL:   ${altsWithUrl}/${totalAlts} (${Math.round(altsWithUrl/totalAlts*100)}%)`);

  if (issues === 0) {
    console.log(`\n  ✅ All widget data fields are present and valid!`);
  } else {
    console.log(`\n  ⚠️  Found ${issues} issue(s) — widget may not render correctly.`);
  }
}

// ── Main ──

async function main() {
  console.log("\n" + DIVIDER);
  console.log("  CARTQUANT FULL FLOW TEST");
  console.log("  Firecrawl configured: " + isScraperConfigured());
  console.log(DIVIDER);

  // 1. Test direct scraper
  await testScraperDirect();

  // 2. Test compare-basket with a small set (balanced mode)
  const response = await testCompareBasket("balanced", ["milk", "eggs", "bread"]);

  // 3. Test product details with a URL from the results
  await testProductDetails(response);

  // 4. Validate the response shape matches what the widget expects
  await testWidgetDataShape(response);

  // 5. Test other modes
  await testCompareBasket("cheapest", ["milk", "eggs", "bread"]);
  await testCompareBasket("cleanest", ["milk", "eggs", "bread"]);

  console.log("\n\n" + DIVIDER);
  console.log("  ALL TESTS COMPLETE");
  console.log(DIVIDER + "\n");
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err);
  process.exit(1);
});
