#!/usr/bin/env node

import minimist from "minimist";
import { assertUnitNormalization, runSingleStoreAudit } from "./audit_harness.js";

const args = minimist(process.argv.slice(2), {
  string: ["city", "query", "strategy"],
  default: {
    city: "Paris",
    query: "pâtes",
    strategy: "cheapest",
    "max-retries": 4
  }
});

console.log("\n🟪 Démarrage Audit Super U");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

await runSingleStoreAudit({
  storeKey: "superu",
  city: String(args.city || "Paris"),
  query: String(args.query || "pâtes"),
  strategy: String(args.strategy || "cheapest"),
  maxRetries: Math.max(1, parseInt(String(args["max-retries"] || "4"), 10)),
  prefix: "[test_superu_single]"
});

assertUnitNormalization();

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🟢 Super U validée (CDP)\n");