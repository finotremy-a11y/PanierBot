#!/usr/bin/env node
/**
 * test_carrefour_flow.js
 *
 * E2E Carrefour flow (CDP only):
 * 1) Select store
 * 2) Search product
 * 3) Extract list
 * 4) Add to cart
 * 5) Verify cart > 0
 *
 * Auto-correction strategy:
 * - Retry with adaptive selector profiles on each attempt
 * - Re-open Carrefour drive page between attempts
 */

import minimist from "minimist";
import { chromium } from "playwright";
import {
  selectCarrefourStore,
  searchCarrefourProduct,
  extractCarrefourProductList,
  addCarrefourToCart
} from "./agents/navigator_agent.js";

const args = minimist(process.argv.slice(2), {
  string: ["city", "query"],
  default: {
    city: "Paris",
    query: "pates",
    "max-retries": 4
  }
});

const CITY = String(args.city || "Paris");
const QUERY = String(args.query || "pates");
const MAX_RETRIES = Math.max(1, parseInt(String(args["max-retries"] || "4"), 10));
const CDP_URL = "http://localhost:9222";
const CARREFOUR_DRIVE_URL = "https://www.carrefour.fr/services/drive";

const LOG_PREFIX = "[test_carrefour_flow]";
function log(msg) { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg) { console.warn(`${LOG_PREFIX} ⚠️  ${msg}`); }
function fail(msg) { console.error(`${LOG_PREFIX} ❌ ${msg}`); }

const ADAPTIVE_PROFILES = [
  {
    label: "react-data-testid",
    extraStoreSearchSelectors: [
      "input[data-testid*='store' i]",
      "input[aria-label*='ville' i]"
    ],
    extraStoreCardSelectors: [
      "[data-testid='store-card']",
      "[data-testid*='store-card' i]"
    ],
    extraStoreButtonSelectors: [
      "button[data-testid*='select' i]",
      "button:has-text('Choisir ce magasin')"
    ],
    extraSearchSelectors: [
      "#vendor-search-handler",
      "input[data-testid*='search' i]"
    ],
    extraSubmitSelectors: [
      "button[data-testid*='search' i]"
    ],
    extraProductCardSelectors: [
      "[data-testid='product-card']",
      "[data-testid*='product-card' i]"
    ],
    extraAddSelectors: [
      "button[data-testid*='add' i]",
      "button[aria-label*='ajouter' i]"
    ],
    extraCartSignals: [
      "[data-testid*='cart-count' i]",
      "[data-testid*='basket-count' i]"
    ]
  },
  {
    label: "generic-react-cards",
    extraStoreSearchSelectors: [
      "input[type='search']",
      "input[placeholder*='code postal' i]"
    ],
    extraStoreCardSelectors: [
      "article[data-testid*='store' i]",
      "li[data-testid*='store' i]",
      "[class*='store-card' i]"
    ],
    extraStoreButtonSelectors: [
      "button:has-text('Choisir')",
      "button:has-text('Sélectionner')"
    ],
    extraSearchSelectors: [
      "input[name='q']",
      "input[placeholder*='produit' i]"
    ],
    extraSubmitSelectors: [
      "button[type='submit']",
      "button[aria-label*='recherche' i]"
    ],
    extraProductCardSelectors: [
      "[data-testid*='product' i]",
      "article[class*='product' i]",
      "div.by_wrapper"
    ],
    extraAddSelectors: [
      "button:has-text('Ajouter')",
      "button:has-text('Ajouter au panier')"
    ],
    extraCartSignals: [
      "a[href*='panier' i]",
      "button[aria-label*='panier' i]",
      "[class*='cart' i] [class*='badge' i]"
    ]
  },
  {
    label: "legacy-fallback",
    extraStoreSearchSelectors: [
      "input[placeholder*='ville' i]",
      "input[name*='store' i]"
    ],
    extraStoreCardSelectors: [
      "[class*='store' i][class*='card' i]",
      "[class*='storeCard' i]"
    ],
    extraStoreButtonSelectors: [
      "button:has-text('Continuer')",
      "button:has-text('Valider')"
    ],
    extraSearchSelectors: [
      "input[type='search']",
      "input[aria-label*='rechercher' i]"
    ],
    extraSubmitSelectors: [
      "button[aria-label*='lancer la recherche' i]",
      "form button[type='submit']"
    ],
    extraProductCardSelectors: [
      "div.by_content",
      "div.by_wrapper",
      "article[data-product-id]"
    ],
    extraAddSelectors: [
      "button[class*='add' i]",
      "button[class*='cart' i]"
    ],
    extraCartSignals: [
      "[data-testid*='cart' i]",
      "[data-testid*='cart' i] [class*='count' i]"
    ]
  }
];

async function getCartCount(page, profile) {
  const selectors = [
    ...(profile.extraCartSignals || []),
    "[data-testid*='cart-count' i]",
    "[data-testid*='basket-count' i]",
    "[data-testid*='cart' i] [class*='count' i]",
    "a[href*='panier' i]",
    "button[aria-label*='panier' i]",
    "[class*='cart' i] [class*='badge' i]"
  ];

  return page.evaluate((signals) => {
    const toNumber = (value) => {
      const match = String(value || "").match(/\d+/);
      return match ? Number(match[0]) : 0;
    };

    let max = 0;
    for (const selector of signals) {
      for (const node of document.querySelectorAll(selector)) {
        const fromText = toNumber(node.textContent);
        const fromAria = toNumber(node.getAttribute("aria-label"));
        const current = Math.max(fromText, fromAria);
        if (current > max) {
          max = current;
        }
      }
    }

    return max;
  }, selectors).catch(() => 0);
}

async function pickBestPage(context) {
  const pages = context.pages();
  if (pages.length === 0) {
    return context.newPage();
  }

  for (const page of pages) {
    const url = String(page.url() || "").toLowerCase();
    if (url.includes("carrefour")) {
      return page;
    }
  }

  return pages[0];
}

async function ensureCarrefourReady(page) {
  const url = String(page.url() || "").toLowerCase();
  if (!url.includes("carrefour")) {
    await page.goto(CARREFOUR_DRIVE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
}

function validateExtractedProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return { ok: false, reason: "Liste produit vide" };
  }

  const firstValid = products.find((item) => {
    return item
      && typeof item.name === "string"
      && item.name.trim().length > 0
      && Number.isFinite(item.unitPrice)
      && item.unitPrice > 0
      && typeof item.availability === "string"
      && item.availability.trim().length > 0;
  });

  if (!firstValid) {
    return { ok: false, reason: "Aucun produit valide (nom/prix/disponibilité)" };
  }

  return { ok: true, reason: null };
}

async function run() {
  log("Connexion CDP Chrome (mode remote debugging)...");

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (error) {
    fail(`Connexion CDP impossible: ${error.message}`);
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = await pickBestPage(context);

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];
    log(`Tentative ${attempt}/${MAX_RETRIES} (profil: ${profile.label})`);

    try {
      await ensureCarrefourReady(page);

      const storeResult = await selectCarrefourStore(page, CITY, {
        timeout: 35000,
        extraStoreSearchSelectors: profile.extraStoreSearchSelectors,
        extraStoreCardSelectors: profile.extraStoreCardSelectors,
        extraStoreButtonSelectors: profile.extraStoreButtonSelectors
      });
      if (!storeResult.success) {
        throw new Error(`Sélection magasin: ${storeResult.error}`);
      }

      const searchResult = await searchCarrefourProduct(page, QUERY, {
        timeout: 25000,
        extraSearchSelectors: profile.extraSearchSelectors,
        extraSubmitSelectors: profile.extraSubmitSelectors,
        extraProductCardSelectors: profile.extraProductCardSelectors
      });
      if (!searchResult.success) {
        throw new Error(`Recherche produit: ${searchResult.error}`);
      }

      const extracted = await extractCarrefourProductList(page, {
        limit: 12,
        timeout: 22000,
        extraCardSelectors: profile.extraProductCardSelectors
      });

      const extractionValidation = validateExtractedProducts(extracted);
      if (!extractionValidation.ok) {
        throw new Error(`Extraction produit: ${extractionValidation.reason}`);
      }

      log(`🔍 Produits extraits: ${extracted.length}`);

      const addResult = await addCarrefourToCart(page, 1, {
        timeout: 18000,
        extraCardSelectors: profile.extraProductCardSelectors,
        extraAddSelectors: profile.extraAddSelectors,
        extraCartSignals: profile.extraCartSignals
      });
      if (!addResult.success) {
        throw new Error(`Ajout panier: ${addResult.error}`);
      }

      const cartCount = await getCartCount(page, profile);
      if (!(cartCount > 0)) {
        throw new Error("Vérification panier: compteur <= 0");
      }

      log(`📦 Panier Carrefour: ${cartCount}`);
      console.log("🛒 Carrefour — Test réussi");
      await browser.close();
      process.exit(0);
    } catch (error) {
      lastError = error;
      warn(`Tentative ${attempt} échouée: ${error.message}`);

      if (attempt < MAX_RETRIES) {
        warn("Auto-correction: changement de profil sélecteurs et réinitialisation de page.");
        try {
          await page.goto(CARREFOUR_DRIVE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(1400);
        } catch (_) {
          // next retry will attempt again
        }
      }
    }
  }

  fail(`Echec final après ${MAX_RETRIES} tentatives: ${lastError ? lastError.message : "Erreur inconnue"}`);
  await browser.close();
  process.exit(1);
}

run().catch((error) => {
  fail(`Crash test Carrefour: ${error.message}`);
  process.exit(1);
});
