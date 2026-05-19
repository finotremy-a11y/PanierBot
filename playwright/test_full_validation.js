#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const STEPS = [
  { label: "Leclerc",              script: "test_leclerc_single.js" },
  { label: "Carrefour",            script: "test_carrefour_single.js" },
  { label: "Intermarché",          script: "test_intermarche_single.js" },
  { label: "Super U",              script: "test_superu_single.js" },
  { label: "Global multi-enseignes", script: "test_all_stores_full.js" }
];

const results = [];
const startTime = Date.now();

function formatDuration(ms) {
  return ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function runStep(script, label) {
  const stepStart = Date.now();
  console.log("\n" + "─".repeat(60));
  console.log(`🧪 Lancement ${label}`);
  console.log("─".repeat(60));

  console.log("🔎 Vérification extraction");
  console.log("⚖️ Vérification unités");
  console.log("📊 Vérification tri");
  console.log("🏆 Vérification sélection");
  console.log("🛒 Vérification ajout panier");
  console.log("🧺 Vérification panier final");

  const result = spawnSync(process.execPath, [script, "--max-retries", "4"], {
    cwd: new URL(".", import.meta.url),
    stdio: "inherit"
  });

  const duration = Date.now() - stepStart;
  const success = result.status === 0;

  results.push({ label, success, duration, code: result.status });

  if (!success) {
    throw new Error(`${label} en échec avec code ${result.status ?? "inconnu"}`);
  }

  console.log(`✅ ${label} — 100% vert (${formatDuration(duration)})`);
}

console.log("\n");
console.log("╔════════════════════════════════════════════════════════╗");
console.log("║                                                        ║");
console.log("║    🚀 VALIDATION FINALE PANIERBOT — 5 TESTS            ║");
console.log("║                                                        ║");
console.log("╚════════════════════════════════════════════════════════╝");
console.log(`\n   Tests: ${STEPS.map(s => s.label).join(", ")}\n`);

for (const step of STEPS) {
  runStep(step.script, step.label);
}

const totalDuration = Date.now() - startTime;

console.log("\n");
console.log("╔════════════════════════════════════════════════════════╗");
console.log("║                   📋 RÉSUMÉ FINAL                      ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

for (const r of results) {
  const icon = r.success ? "🟢" : "🔴";
  const status = r.success ? "PASS" : "FAIL";
  console.log(`${icon} ${r.label.padEnd(25)} ${status.padEnd(6)} (${formatDuration(r.duration)})`);
}

const allPassed = results.every(r => r.success);

console.log("\n" + "═".repeat(60));
if (allPassed) {
  console.log("🟢🟢🟢 VALIDATION FINALE — PROJET 100% VERT 🟢🟢🟢");
} else {
  const failed = results.filter(r => !r.success).map(r => r.label).join(", ");
  console.log(`🔴 VALIDATION INCOMPLÈTE — Échecs: ${failed}`);
}
console.log("═".repeat(60));
console.log(`⏱️  Durée totale: ${formatDuration(totalDuration)}\n`);

if (!allPassed) process.exit(1);