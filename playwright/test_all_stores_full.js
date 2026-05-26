#!/usr/bin/env node

import minimist from "minimist";
import { runGlobalAudit } from "./audit_harness.js";

const args = minimist(process.argv.slice(2), {
  string: ["items", "city", "strategy"],
  default: {
    items: "pâtes,lait",
    city: "Paris",
    strategy: "cheapest",
    "max-retries": 4
  }
});

const items = String(args.items || "pâtes,lait").split(",").map((item) => item.trim()).filter(Boolean);
const requireLiveAudit = String(process.env.REQUIRE_LIVE_AUDIT || "0") === "1";

console.log("\n🌍 Démarrage Audit Global Multi-Enseignes");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`   Items: ${items.join(", ")}`);
console.log(`   Enseignes: Leclerc, Carrefour, Intermarché, Super U`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

const result = await runGlobalAudit({
  items,
  city: String(args.city || "Paris"),
  strategy: String(args.strategy || "cheapest"),
  maxRetries: Math.max(1, parseInt(String(args["max-retries"] || "4"), 10)),
  prefix: "[test_all_stores_full]"
});

if (!result.items.every((entry) => entry.winnerProduct)) {
  throw new Error("Audit global: produit gagnant manquant");
}

if (requireLiveAudit && !result.live) {
  throw new Error("Audit global: fallback offline utilisé alors que REQUIRE_LIVE_AUDIT=1");
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`🟢 Audit global validé (${result.live ? "CDP" : "fallback offline"})`);
console.log(`🟢🟢🟢 VALIDATION FINALE — 100% VERT (${result.live ? "CDP" : "FALLBACK OFFLINE"}) 🟢🟢🟢\n`);