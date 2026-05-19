#!/usr/bin/env node

/**
 * PanierBot — Compare Stores Script
 * Runs a multi-store comparison via runGlobalAudit and outputs structured JSON.
 * Called by ComparisonBuilder Rails service for multi_store mode.
 *
 * Usage:
 *   node compare_stores.js --items "pâtes,lait" --strategy cheapest --city Paris
 *
 * Output (stdout):
 *   PANIERBOT_JSON_START
 *   { "success": true, "items": [...], "optimal_cart": {...} }
 *   PANIERBOT_JSON_END
 */

import minimist from "minimist";
import { runGlobalAudit } from "./audit_harness.js";

const args = minimist(process.argv.slice(2), {
  string: ["items", "city", "strategy"],
  default: {
    items: "pâtes",
    city: "Paris",
    strategy: "cheapest",
    "max-retries": "4"
  }
});

const items = String(args.items || "pâtes")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const city = String(args.city || "Paris");
const strategy = String(args.strategy || "cheapest");
const maxRetries = Math.max(1, parseInt(String(args["max-retries"] || "4"), 10));

function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function buildOptimalCart(itemResults) {
  const stores = {};
  let total = 0;

  for (const entry of itemResults) {
    const store = entry.winnerStore;
    const product = entry.winnerProduct;
    if (!store || !product) continue;

    if (!stores[store]) {
      stores[store] = { label: store, items: [], subtotal: 0 };
    }

    const price = roundTo(product.price, 2) || 0;
    stores[store].items.push({
      query: entry.item,
      product_name: product.name,
      price,
      price_per_kg: roundTo(product.pricePerKg, 4),
      price_per_l: roundTo(product.pricePerL, 4),
      price_per_unit: roundTo(product.pricePerUnit, 4),
      quantity: product.quantity || null,
      url: product.url || null,
      image: product.image || null
    });

    stores[store].subtotal = roundTo((stores[store].subtotal || 0) + price, 2);
    total = roundTo((total || 0) + price, 2);
  }

  // Determine cheapest single store (for single_store recommendation)
  const storeKeys = Object.keys(stores);
  let bestStore = null;
  let bestStoreTotal = Infinity;
  for (const storeKey of storeKeys) {
    if (stores[storeKey].subtotal < bestStoreTotal) {
      bestStoreTotal = stores[storeKey].subtotal;
      bestStore = storeKey;
    }
  }

  return { total, stores, best_single_store: bestStore };
}

let exitCode = 0;

try {
  const result = await runGlobalAudit({
    items,
    city,
    strategy,
    maxRetries,
    prefix: "[compare_stores]"
  });

  const itemResults = Array.isArray(result?.items) ? result.items : [];

  const output = {
    success: true,
    mode: "multi_store",
    strategy,
    city,
    items: itemResults.map((entry) => ({
      query: entry.item,
      winner_store: entry.winnerStore || null,
      winner_product: entry.winnerProduct
        ? {
            name: entry.winnerProduct.name || null,
            price: roundTo(entry.winnerProduct.price, 2),
            price_per_kg: roundTo(entry.winnerProduct.pricePerKg, 4),
            price_per_l: roundTo(entry.winnerProduct.pricePerL, 4),
            price_per_unit: roundTo(entry.winnerProduct.pricePerUnit, 4),
            quantity: entry.winnerProduct.quantity || null,
            url: entry.winnerProduct.url || null,
            image: entry.winnerProduct.image || null
          }
        : null,
      cart_count: entry.cartCount || 0
    })),
    optimal_cart: buildOptimalCart(itemResults)
  };

  process.stdout.write("PANIERBOT_JSON_START\n");
  process.stdout.write(JSON.stringify(output) + "\n");
  process.stdout.write("PANIERBOT_JSON_END\n");
} catch (err) {
  exitCode = 1;

  const output = {
    success: false,
    mode: "multi_store",
    strategy,
    errors: [err.message || "Erreur inconnue lors de la comparaison multi-enseignes"]
  };

  process.stdout.write("PANIERBOT_JSON_START\n");
  process.stdout.write(JSON.stringify(output) + "\n");
  process.stdout.write("PANIERBOT_JSON_END\n");
}

process.exit(exitCode);
