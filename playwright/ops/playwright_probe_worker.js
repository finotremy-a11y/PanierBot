import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const LOG_DIR = process.env.AGENT_LOG_DIR || "/var/log/agent";
const LOG_FILE = `${LOG_DIR}/playwright-probe.log`;
const HEARTBEAT_FILE = process.env.HEARTBEAT_FILE || "/tmp/playwright-heartbeat.json";
const CHROME_PORT = process.env.CHROME_DEBUG_PORT || "9222";
const CDP_URL = `http://127.0.0.1:${CHROME_PORT}`;
const LOOP_INTERVAL_MS = 15_000;

const EXTRACTION_SAMPLE = `
  <article class="product-card">
    <h3>Pates Penne 500g</h3>
    <div class="price">1,99 €</div>
    <button>Ajouter au panier</button>
  </article>
`;

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_FILE, line, "utf8");
}

async function writeHeartbeat(status, details = {}) {
  const payload = {
    timestampMs: Date.now(),
    status,
    details
  };
  await writeFile(HEARTBEAT_FILE, JSON.stringify(payload), "utf8");
}

async function verifyExtraction() {
  const navigatorModule = await import("/rails/playwright/agents/navigator_agent.js");
  const products = navigatorModule.extractProductsFromHtml(EXTRACTION_SAMPLE, "leclerc");

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("extraction returned no products");
  }
}

async function verifyCdp() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  try {
    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto("about:blank", { waitUntil: "domcontentloaded", timeout: 7000 });
  } finally {
    await browser.close();
  }
}

async function runProbeLoop() {
  await mkdir(LOG_DIR, { recursive: true });
  await log("playwright probe loop started");

  while (true) {
    try {
      await verifyCdp();
      await verifyExtraction();
      await writeHeartbeat("ok", { cdp: true, extraction: true });
      await log("probe ok");
    } catch (error) {
      await writeHeartbeat("error", { message: error.message });
      await log(`probe error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_MS));
  }
}

runProbeLoop().catch(async (error) => {
  await mkdir(LOG_DIR, { recursive: true });
  await log(`probe fatal: ${error.message}`);
  process.exit(1);
});
