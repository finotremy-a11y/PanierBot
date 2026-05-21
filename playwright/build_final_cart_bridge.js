#!/usr/bin/env node

import minimist from "minimist";
import { runGlobalAudit } from "./audit_harness.js";
import { buildFinalCart, normalizeItems, normalizeProduct } from "./agents/navigator_agent.js";

const STORE_ORDER = ["leclerc", "carrefour", "intermarche", "superu"];

const args = minimist(process.argv.slice(2), {
  string: ["items", "strategy", "mode", "city", "max-retries"],
  default: {
    items: "pâtes",
    strategy: "cheapest",
    mode: "multi_store",
    city: "Paris",
    "max-retries": "4"
  }
});

const items = normalizeItems(String(args.items || ""));
const strategy = String(args.strategy || "cheapest");
const mode = String(args.mode || "multi_store");
const city = String(args.city || "Paris");
const maxRetries = Math.max(1, parseInt(String(args["max-retries"] || "4"), 10));

function toNormalizedProduct(product, store) {
  if (!product || typeof product !== "object") {
    return null;
  }

  return normalizeProduct({
    ...product,
    availability: product.availability || "disponible"
  }, { store, index: 0 });
}

function createAdaptersByItem(globalItems) {
  const indexByItem = new Map(globalItems.map((entry) => [String(entry.item || "").toLowerCase(), entry]));

  return Object.fromEntries(STORE_ORDER.map((store) => {
    return [store, {
      search: async () => ({ success: true }),
      extract: async (_context, options = {}) => {
        const itemKey = String(options.query || "").toLowerCase();
        const winner = indexByItem.get(itemKey);

        if (!winner || winner.winnerStore !== store) {
          return [];
        }

        const normalized = toNormalizedProduct(winner.winnerProduct, store);
        return normalized ? [normalized] : [];
      },
      add: async () => ({ success: true })
    }];
  }));
}

function summarizeStores(cartByStore = {}) {
  return Object.entries(cartByStore).map(([store, selected]) => {
    const items = Array.isArray(selected) ? selected : [];
    const subtotal = items.reduce((sum, product) => {
      const price = Number(product?.price);
      return Number.isFinite(price) ? sum + price : sum;
    }, 0);

    return {
      store,
      item_count: items.length,
      subtotal: Math.round(subtotal * 100) / 100
    };
  });
}

(async () => {
  try {
    if (items.length === 0) {
      throw new Error("No items provided");
    }

    const globalAudit = await runGlobalAudit({
      items,
      city,
      strategy,
      maxRetries,
      prefix: "[build-final-cart-bridge]"
    });

    const adapters = createAdaptersByItem(Array.isArray(globalAudit?.items) ? globalAudit.items : []);
    const logs = [];

    const finalCart = await buildFinalCart(items, strategy, mode, {
      adapters,
      logs,
      storeOrder: STORE_ORDER
    });

    const results = Array.isArray(finalCart?.results) ? finalCart.results : [];
    const response = {
      success: finalCart?.success === true,
      mode,
      strategy,
      city,
      total: Number(finalCart?.total || 0),
      stores: summarizeStores(finalCart?.cartByStore),
      results: results.map((entry) => ({
        item: entry.item,
        selected_store: entry.selectedStore,
        selected_product: entry.selectedProduct || null,
        success: entry.success !== false,
        add_result: entry.addResult || null
      })),
      logs,
      errors: []
    };

    process.stdout.write("PANIERBOT_JSON_START\n");
    process.stdout.write(`${JSON.stringify(response)}\n`);
    process.stdout.write("PANIERBOT_JSON_END\n");
    process.exit(0);
  } catch (error) {
    const failure = {
      success: false,
      total: 0,
      stores: [],
      results: [],
      logs: [],
      errors: [error?.message || "Unknown buildFinalCart bridge error"]
    };

    process.stdout.write("PANIERBOT_JSON_START\n");
    process.stdout.write(`${JSON.stringify(failure)}\n`);
    process.stdout.write("PANIERBOT_JSON_END\n");
    process.exit(1);
  }
})();
