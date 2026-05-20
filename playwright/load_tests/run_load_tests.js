import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { runScrapingProbe } from "./scraping_probe.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(__dirname, "results");
const REPORTS_DIR = path.join(__dirname, "reports");
const BASE_SCENARIO_PATH = path.join(__dirname, "artillery_scenario_base.json");

const TARGET_USERS = [10, 50, 100];
const LOAD_DURATION_SEC = toPositiveNumber(process.env.LOAD_TEST_DURATION_SEC, 45);
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.PANIERBOT_API_KEY || "test-api-key";
const CDP_URL = process.env.CDP_URL || "http://127.0.0.1:9222";
const CDP_CONNECT_CHECK = String(process.env.CDP_CONNECT_CHECK || "true").toLowerCase() !== "false";

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

function summarizeLatencies(latencies) {
  if (!latencies.length) {
    return { avgMs: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }

  const total = latencies.reduce((sum, value) => sum + value, 0);
  return {
    avgMs: Number((total / latencies.length).toFixed(2)),
    p95Ms: percentile(latencies, 95),
    minMs: Number(Math.min(...latencies).toFixed(2)),
    maxMs: Number(Math.max(...latencies).toFixed(2))
  };
}

function cloneCpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function computeCpuUsage(prev, next) {
  const perCore = prev.map((prevCore, index) => {
    const nextCore = next[index];
    const idle = Math.max(0, nextCore.idle - prevCore.idle);
    const totalPrev = Object.values(prevCore).reduce((sum, value) => sum + value, 0);
    const totalNext = Object.values(nextCore).reduce((sum, value) => sum + value, 0);
    const total = Math.max(1, totalNext - totalPrev);
    const busy = Math.max(0, total - idle);
    return (busy / total) * 100;
  });

  return perCore.reduce((sum, value) => sum + value, 0) / Math.max(1, perCore.length);
}

function startCpuSampler(intervalMs = 1000) {
  let prev = cloneCpuSnapshot();
  const samples = [];

  const timer = setInterval(() => {
    const next = cloneCpuSnapshot();
    const usage = computeCpuUsage(prev, next);
    samples.push(Number(usage.toFixed(2)));
    prev = next;
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
      const avg = samples.length
        ? Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2))
        : 0;
      const max = samples.length ? Number(Math.max(...samples).toFixed(2)) : 0;

      return {
        avgCpuPercent: avg,
        maxCpuPercent: max,
        samples
      };
    }
  };
}

async function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed (${command} ${args.join(" ")}) with code ${code}`));
      }
    });
  });
}

function deepFindMetric(obj, needle) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(obj, needle)) {
    return obj[needle];
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = deepFindMetric(value, needle);
      if (found !== null && found !== undefined) {
        return found;
      }
    }
  }

  return null;
}

function extractArtilleryMetrics(reportJson) {
  const aggregate = reportJson.aggregate || {};
  const counters = aggregate.counters || {};

  const requestCount = Number(
    counters["http.requests"]
      || counters["http.requests.total"]
      || deepFindMetric(reportJson, "http.requests")
      || 0
  );

  const errorCount = Number(
    counters.errors
      || counters["http.codes.4xx"]
      || 0
  ) + Number(counters["http.codes.5xx"] || 0);

  const responseSummary = deepFindMetric(reportJson, "http.response_time") || {};

  const avgMs = Number(responseSummary.mean || responseSummary.average || responseSummary.avg || 0);
  const p95Ms = Number(responseSummary.p95 || responseSummary["95"] || 0);
  const minMs = Number(responseSummary.min || 0);
  const maxMs = Number(responseSummary.max || 0);

  const errorRate = requestCount > 0 ? Number(((errorCount / requestCount) * 100).toFixed(2)) : 0;

  return {
    requests: requestCount,
    errors: errorCount,
    errorRate,
    latency: {
      avgMs: Number(avgMs.toFixed(2)),
      p95Ms: Number(p95Ms.toFixed(2)),
      minMs: Number(minMs.toFixed(2)),
      maxMs: Number(maxMs.toFixed(2))
    }
  };
}

async function runArtilleryScenario(users) {
  const baseRaw = await fs.readFile(BASE_SCENARIO_PATH, "utf8");
  const baseConfig = JSON.parse(baseRaw);

  const scenario = {
    ...baseConfig,
    config: {
      ...baseConfig.config,
      target: API_BASE_URL,
      phases: [
        {
          duration: LOAD_DURATION_SEC,
          arrivalRate: users,
          maxVusers: users,
          name: `steady-${users}-users`
        }
      ],
      http: {
        ...(baseConfig.config?.http || {}),
        headers: {
          ...((baseConfig.config && baseConfig.config.http && baseConfig.config.http.headers) || {}),
          "X-API-Key": API_KEY
        }
      }
    }
  };

  const scenarioPath = path.join(RESULTS_DIR, `artillery_scenario_${users}.json`);
  const jsonResultPath = path.join(RESULTS_DIR, `artillery_result_${users}.json`);
  const htmlReportPath = path.join(REPORTS_DIR, `artillery_report_${users}.html`);

  await fs.writeFile(scenarioPath, JSON.stringify(scenario, null, 2));

  await execCommand("npx", ["artillery", "run", scenarioPath, "--output", jsonResultPath]);
  await execCommand("npx", ["artillery", "report", "--output", htmlReportPath, jsonResultPath]);

  const raw = await fs.readFile(jsonResultPath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    users,
    resultJsonPath: jsonResultPath,
    resultHtmlPath: htmlReportPath,
    metrics: extractArtilleryMetrics(parsed)
  };
}

async function runCdpStabilityProbe({ users, durationSec }) {
  const attempts = Math.max(20, users * 2);
  const endAt = Date.now() + durationSec * 1000;

  let success = 0;
  let failures = 0;
  const latencies = [];

  for (let index = 0; index < attempts && Date.now() < endAt; index += 1) {
    const started = process.hrtime.bigint();

    try {
      const response = await fetch(`${CDP_URL}/json/version`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`CDP endpoint status ${response.status}`);
      }

      if (CDP_CONNECT_CHECK) {
        const browser = await chromium.connectOverCDP(CDP_URL);
        await browser.close();
      }

      success += 1;
    } catch (error) {
      failures += 1;
    } finally {
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      latencies.push(elapsed);
    }
  }

  const stats = summarizeLatencies(latencies);
  const total = success + failures;

  return {
    attempts: total,
    success,
    failures,
    stabilityPercent: total > 0 ? Number(((success / total) * 100).toFixed(2)) : 0,
    latency: stats,
    cdpUrl: CDP_URL
  };
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function writeConsolidatedHtmlReport(rows) {
  const generatedAt = new Date().toISOString();
  const lines = rows.map((row) => {
    const artilleryFile = path.basename(row.api.resultHtmlPath);
    return `
      <tr>
        <td>${row.users}</td>
        <td>${row.api.metrics.latency.avgMs}</td>
        <td>${row.api.metrics.latency.p95Ms}</td>
        <td>${row.api.metrics.errorRate}%</td>
        <td>${row.scraping.latency.avgMs}</td>
        <td>${row.scraping.latency.p95Ms}</td>
        <td>${row.scraping.errorRate}%</td>
        <td>${row.cpu.avgCpuPercent}% / ${row.cpu.maxCpuPercent}%</td>
        <td>${row.cdp.stabilityPercent}%</td>
        <td>${row.cdp.latency.avgMs}</td>
        <td><a href="${htmlEscape(artilleryFile)}">rapport ${row.users}</a></td>
      </tr>
    `;
  }).join("\n");

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PanierBot - Rapport de charge</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #102133;
      --muted: #526273;
      --line: #d8e0ea;
      --accent: #0a7d5b;
    }

    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--text);
      background: radial-gradient(circle at top right, #dff1eb, transparent 40%), var(--bg);
      padding: 24px;
    }

    .card {
      max-width: 1200px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(16, 33, 51, 0.08);
      overflow: hidden;
    }

    header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(120deg, #ecf9f4 0%, #ffffff 70%);
    }

    h1 {
      margin: 0;
      font-size: 1.4rem;
      letter-spacing: 0.02em;
    }

    p {
      margin: 8px 0 0;
      color: var(--muted);
    }

    .table-wrap {
      overflow-x: auto;
      padding: 16px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }

    th,
    td {
      border: 1px solid var(--line);
      padding: 10px;
      font-size: 0.92rem;
      text-align: center;
    }

    th {
      background: #f0f5fb;
      font-weight: 600;
    }

    a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <section class="card">
    <header>
      <h1>PanierBot - Rapport de tests de charge</h1>
      <p>Généré le ${htmlEscape(generatedAt)} · Cible API: ${htmlEscape(API_BASE_URL)} · CDP: ${htmlEscape(CDP_URL)}</p>
    </header>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Utilisateurs</th>
            <th>API avg (ms)</th>
            <th>API p95 (ms)</th>
            <th>API erreurs</th>
            <th>Scraping avg (ms)</th>
            <th>Scraping p95 (ms)</th>
            <th>Scraping erreurs</th>
            <th>CPU avg/max</th>
            <th>CDP stabilité</th>
            <th>CDP avg (ms)</th>
            <th>Détail Artillery</th>
          </tr>
        </thead>
        <tbody>
          ${lines}
        </tbody>
      </table>
    </div>
  </section>
</body>
</html>`;

  const reportPath = path.join(REPORTS_DIR, "load-test-report.html");
  await fs.writeFile(reportPath, html, "utf8");
  return reportPath;
}

async function runOneScenario(users) {
  console.log(`\n=== Scenario ${users} utilisateurs ===`);

  const cpuSampler = startCpuSampler();

  const [api, scraping, cdp] = await Promise.all([
    runArtilleryScenario(users),
    runScrapingProbe({ users, durationSec: LOAD_DURATION_SEC }),
    runCdpStabilityProbe({ users, durationSec: LOAD_DURATION_SEC })
  ]);

  const cpu = cpuSampler.stop();

  return {
    users,
    api,
    scraping,
    cdp,
    cpu
  };
}

async function main() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const rows = [];

  for (const users of TARGET_USERS) {
    const row = await runOneScenario(users);
    rows.push(row);
  }

  const consolidatedReportPath = await writeConsolidatedHtmlReport(rows);

  const summaryPath = path.join(RESULTS_DIR, "load_test_summary.json");
  await fs.writeFile(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    cdpUrl: CDP_URL,
    durationSec: LOAD_DURATION_SEC,
    scenarios: rows
  }, null, 2));

  console.log(`\nRapport consolidé: ${consolidatedReportPath}`);
  console.log(`Résumé JSON: ${summaryPath}`);
  console.log("🟢 Tests de charge terminés");
}

main().catch((error) => {
  console.error("Erreur pendant les tests de charge:", error.message);
  process.exitCode = 1;
});
