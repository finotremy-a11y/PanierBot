#!/usr/bin/env node

import minimist from "minimist";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = minimist(process.argv.slice(2), {
  string: ["city", "query", "strategy"],
  default: {
    city: "Paris",
    query: "pâtes",
    strategy: "cheapest",
    "max-retries": 4
  }
});

const PHASES = [
  {
    id: 1,
    name: "Audit par Enseigne",
    tests: [
      { name: "Leclerc", file: "test_leclerc_single.js" },
      { name: "Carrefour", file: "test_carrefour_single.js" },
      { name: "Intermarché", file: "test_intermarche_single.js" },
      { name: "Super U", file: "test_superu_single.js" }
    ]
  },
  {
    id: 2,
    name: "Audit Global Multi-Enseignes",
    tests: [
      { name: "Global", file: "test_all_stores_full.js" }
    ]
  }
];

let results = {
  phase1: {},
  phase2: {},
  phase3: {}
};

function formatTimestamp() {
  return new Date().toLocaleTimeString("fr-FR");
}

async function runTest(testFile, testName, phase) {
  return new Promise((resolve) => {
    console.log(`\n⏳ [${formatTimestamp()}] Exécution ${testName}...`);
    
    const child = spawn("node", [testFile], {
      cwd: __dirname,
      stdio: "inherit"
    });

    child.on("close", (code) => {
      const success = code === 0;
      const status = success ? "✅" : "❌";
      console.log(`${status} [${formatTimestamp()}] ${testName} ${success ? "réussi" : "échoué (code " + code + ")"}`);
      
      resolve({
        name: testName,
        file: testFile,
        success,
        phase,
        timestamp: formatTimestamp()
      });
    });

    child.on("error", (err) => {
      console.error(`❌ Erreur au lancement de ${testName}:`, err);
      resolve({
        name: testName,
        file: testFile,
        success: false,
        phase,
        error: err.message,
        timestamp: formatTimestamp()
      });
    });
  });
}

function displayPhaseHeader(phaseName, phaseId) {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log(`║ PHASE ${phaseId}: ${phaseName.padEnd(41)} ║`);
  console.log("╚════════════════════════════════════════════════════════╝");
}

function displayPhaseSummary(phaseName, tests, results) {
  const passed = tests.filter(t => results[t.file]?.success).length;
  const total = tests.length;
  const status = passed === total ? "✅ VERT" : "❌ ROUGE";
  
  console.log("\n" + "═".repeat(60));
  console.log(`📊 Résumé Phase: ${phaseName}`);
  console.log("═".repeat(60));
  tests.forEach(test => {
    const res = results[test.file];
    const icon = res?.success ? "🟢" : "🔴";
    console.log(`${icon} ${test.name.padEnd(20)} ${res?.success ? "✓ PASS" : "✗ FAIL"}`);
  });
  console.log(`\n${status} ${passed}/${total} tests réussis`);
  console.log("═".repeat(60));
  
  return passed === total;
}

async function runPhase(phase) {
  displayPhaseHeader(phase.name, phase.id);
  
  const phaseResults = {};
  for (const test of phase.tests) {
    const result = await runTest(test.file, test.name, phase.id);
    phaseResults[test.file] = result;
  }
  
  const allPassed = displayPhaseSummary(phase.name, phase.tests, phaseResults);
  
  return {
    phaseId: phase.id,
    phaseName: phase.name,
    allPassed,
    results: phaseResults
  };
}

async function main() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║                                                        ║");
  console.log("║        🚀 VALIDATION FINALE - PANIERBOT 🚀             ║");
  console.log("║                                                        ║");
  console.log("║   Audit complet: 4 enseignes + Multi-enseignes         ║");
  console.log("║                                                        ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("\n");
  
  const startTime = Date.now();
  
  // Phase 1 & 2
  for (const phase of PHASES) {
    const result = await runPhase(phase);
    results[`phase${phase.id}`] = result;
    
    if (!result.allPassed) {
      console.log(`\n⚠️  Phase ${phase.id} NON réussie. Arrêt de la validation.`);
      break;
    }
  }
  
  // Summary finale
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║                   📋 RÉSUMÉ FINAL                      ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
  
  const phase1Ok = results.phase1.allPassed;
  const phase2Ok = results.phase2.allPassed;
  
  console.log(`Phase 1 (Par Enseigne):       ${phase1Ok ? "🟢 VERT" : "🔴 ROUGE"}`);
  console.log(`Phase 2 (Global Multi):       ${phase2Ok ? "🟢 VERT" : "🔴 ROUGE"}`);
  
  const allSuccess = phase1Ok && phase2Ok;
  
  console.log("\n" + "═".repeat(60));
  if (allSuccess) {
    console.log("🟢🟢🟢 VALIDATION FINALE — PROJET 100% VERT 🟢🟢🟢");
  } else {
    console.log("🔴 VALIDATION INCOMPLÈTE — Erreurs détectées");
  }
  console.log("═".repeat(60));
  console.log(`⏱️  Durée totale: ${elapsed}s`);
  console.log("\n");
  
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
