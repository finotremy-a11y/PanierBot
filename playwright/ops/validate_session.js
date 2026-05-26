#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import minimist from "minimist";
import { chromium } from "playwright";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLAYWRIGHT_DIR = path.dirname(MODULE_DIR);
const LOGS_DIR = path.join(PLAYWRIGHT_DIR, "logs");
const SESSION_VALIDATION_PATH = path.join(LOGS_DIR, "session_validation.json");

const args = minimist(process.argv.slice(2), {
  string: ["store", "cdp-url", "ttl-sec"],
  default: {
    store: "intermarche",
    "cdp-url": process.env.CDP_URL || "http://localhost:9222",
    "ttl-sec": process.env.SESSION_VALIDATION_TTL_SEC || "7200"
  }
});

const store = String(args.store || "intermarche").trim().toLowerCase();
const cdpUrl = String(args["cdp-url"] || "http://localhost:9222").trim();
const ttlSec = Math.max(300, parseInt(String(args["ttl-sec"] || "7200"), 10));

async function ensureLogsDir() {
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

async function readState() {
  await ensureLogsDir();
  try {
    const raw = await fs.readFile(SESSION_VALIDATION_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { stores: {} };
  } catch (_) {
    return { stores: {} };
  }
}

async function writeState(state) {
  await ensureLogsDir();
  await fs.writeFile(SESSION_VALIDATION_PATH, JSON.stringify(state, null, 2));
}

async function resolveValidationEvidence(page, targetStore) {
  return page.evaluate((expectedStore) => {
    const lower = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
    const body = lower(document.body?.innerText || "");
    const html = lower(document.documentElement?.innerText || "");
    const url = lower(window.location.href || "");
    const title = lower(document.title || "");

    const iframeSources = Array.from(document.querySelectorAll("iframe"))
      .map((frame) => lower(frame.src || ""))
      .filter(Boolean);

    const antiBotIframe = iframeSources.find((src) => src.includes("captcha-delivery.com") || src.includes("hcaptcha") || src.includes("recaptcha") || src.includes("datadome")) || null;
    const antiBotText = /captcha|challenge|just a moment|please enable js|access denied|forbidden/.test(body) || /captcha|challenge|just a moment/.test(title);
    const blocked = Boolean(antiBotIframe || antiBotText || (body.length === 0 && iframeSources.length > 0));

    const storeSignals = {
      intermarche: body.includes("intermarch") || url.includes("intermarche"),
      leclerc: body.includes("leclerc") || url.includes("leclerc"),
      carrefour: body.includes("carrefour") || url.includes("carrefour"),
      superu: body.includes("coursesu") || body.includes("super u") || url.includes("coursesu")
    };

    const expectedVisible = Boolean(storeSignals[expectedStore]);
    const searchVisible = Array.from(document.querySelectorAll("input[type='search'], input[name='search'], input[name='q']")).some((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 2 && rect.height > 2 && style.display !== "none" && style.visibility !== "hidden";
    });

    return {
      url,
      title,
      blocked,
      antiBotIframe,
      bodyLength: body.length,
      expectedVisible,
      searchVisible,
      evidence: {
        hasCatalogSignals: body.includes("produits") || body.includes("rayons") || body.includes("ajouter au panier"),
        hasStoreSignal: expectedVisible
      }
    };
  }, targetStore);
}

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl, { timeout: 60000 });
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();

    const evidence = await resolveValidationEvidence(page, store);
    if (evidence.blocked) {
      console.error(`Session invalidée: anti-bot détecté (${evidence.antiBotIframe || "challenge"})`);
      process.exit(1);
    }

    if (!evidence.expectedVisible && !evidence.searchVisible) {
      console.error(`Session invalide: aucun signal exploitable détecté pour ${store}`);
      process.exit(1);
    }

    const state = await readState();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSec * 1000);

    state.updatedAt = now.toISOString();
    state.stores = state.stores || {};
    state.stores[store] = {
      validatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      url: evidence.url,
      title: evidence.title,
      ttlSec,
      evidence: evidence.evidence
    };

    await writeState(state);

    console.log(`Session validée pour ${store}`);
    console.log(`Expire le ${expiresAt.toISOString()}`);
    process.exit(0);
  } catch (error) {
    console.error(`Validation session échouée: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser && typeof browser.isConnected === "function" && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
})();
