#!/usr/bin/env node
/**
 * test_extract_products.js
 *
 * E2E Leclerc extraction flow:
 * 1) Connect local Chrome via CDP
 * 2) Select store
 * 3) Search product (default: "pates")
 * 4) Extract first 10 products
 * 5) Validate each product has at least name, unitPrice, internalId
 * 6) Auto-adapt selectors and retry until success or max retries reached
 */

import minimist from "minimist";
import { chromium } from "playwright";
import {
  selectLeclercDriveArrow,
  searchProduct,
  extractProductList
} from "./agents/navigator_agent.js";

const args = minimist(process.argv.slice(2), {
  string: ["city", "query"],
  default: {
    city: "Rodez",
    query: "pates",
    "max-retries": 5
  }
});

const CITY = String(args.city || "Rodez");
const QUERY = String(args.query || "pates");
const MAX_RETRIES = Math.max(1, parseInt(String(args["max-retries"] || "5"), 10));
const CDP_URL = "http://localhost:9222";
const LECLERC_URL = "https://www.leclercdrive.fr/";

const LOG_PREFIX = "[test_extract_products]";
function log(msg) { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg) { console.warn(`${LOG_PREFIX} ⚠️  ${msg}`); }
function fail(msg) { console.error(`${LOG_PREFIX} ❌ ${msg}`); }

const COOKIE_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button:has-text('Tout accepter')",
  "button:has-text('Accepter')",
  "button[id*='accept' i]"
];

const STORE_SEARCH_SELECTORS = [
  "input[id='wpad-recherche-magasin-input']",
  "input[placeholder*='où souhaitez' i]",
  "input[placeholder*='code postal' i]",
  "input[placeholder*='ville' i]",
  "input[aria-label*='magasin' i]",
  "input[name*='store' i]",
  "input[type='search']"
];

const ADAPTIVE_PROFILES = [
  {
    label: "baseline",
    extraCardSelectors: []
  },
  {
    label: "iel-first",
    extraCardSelectors: [
      "section [class*='iel-product' i]",
      "section [class*='iel-card' i]",
      "main [class*='product' i]"
    ]
  },
  {
    label: "grid-fallback",
    extraCardSelectors: [
      "[class*='grid' i] article",
      "[class*='grid' i] li",
      "[class*='product-list' i] article",
      "[class*='product-list' i] li",
      "main article",
      "main li"
    ]
  }
];

async function findFirst(page, selectors, timeout = 3500) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout });
      return sel;
    } catch (_) {
      // continue
    }
  }
  return null;
}

async function safeClick(page, selectors, label = "element") {
  const sel = await findFirst(page, selectors, 2500);
  if (!sel) {
    log(`  ${label} non detecte — ignore`);
    return false;
  }

  try {
    await page.click(sel, { timeout: 3500 });
    log(`  Clic sur ${label} : ${sel}`);
    return true;
  } catch (_) {
    return false;
  }
}

async function isCaptchaOrBlocked(page) {
  try {
    const frameUrls = page.frames().map((f) => String(f.url() || "").toLowerCase());
    if (frameUrls.some((u) => u.includes("captcha-delivery.com") || u.includes("datadome"))) {
      return true;
    }
    const bodyLen = await page.evaluate(() => (document.body?.innerText || "").trim().length);
    return bodyLen === 0;
  } catch (_) {
    return true;
  }
}

async function pickBestPage(context) {
  const pages = context.pages();
  if (pages.length === 0) {
    return context.newPage();
  }

  for (const p of pages) {
    const url = String(p.url() || "").toLowerCase();
    if (!url.includes("leclercdrive.fr")) continue;
    if (!(await isCaptchaOrBlocked(p))) return p;
  }

  for (const p of pages) {
    const url = String(p.url() || "").toLowerCase();
    if (url.includes("leclercdrive.fr")) return p;
  }

  return pages[0];
}

async function ensureLeclercReady(page) {
  const currentUrl = String(page.url() || "");
  if (!currentUrl.includes("leclercdrive.fr")) {
    log(`Chargement de ${LECLERC_URL}...`);
    await page.goto(LECLERC_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
  }

  if (await isCaptchaOrBlocked(page)) {
    throw new Error("Page bloquee par anti-bot/CAPTCHA");
  }
}

async function selectStoreIfNeeded(page, city) {
  const storeInput = await findFirst(page, STORE_SEARCH_SELECTORS, 5000);
  if (!storeInput) {
    log("Store possiblement deja selectionne — pas de popin magasin detectee");
    return;
  }

  log(`Selection du magasin: ${city}`);
  await page.click(storeInput, { timeout: 5000 });
  await page.fill(storeInput, "");
  await page.type(storeInput, city, { delay: 70 });
  await page.waitForTimeout(900);

  const option = page.locator("[role='option']").filter({ hasText: city }).first();
  if (await option.count()) {
    await option.click({ timeout: 3000 });
    await page.waitForTimeout(800);
  } else {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
  }

  const storeResult = await selectLeclercDriveArrow(page, {
    storeListTimeout: 25000,
    panelTimeout: 9000
  });
  if (!storeResult.success) {
    throw new Error(storeResult.error || "Selection magasin echouee");
  }
}

async function fallbackSearch(page, query) {
  const selectors = [
    "input[name='q']",
    "input[id*='search' i]",
    "header input[type='search']",
    "main input[type='search']",
    "input[type='search']",
    "input[type='text']"
  ];

  const sel = await findFirst(page, selectors, 4500);
  if (sel) {
    const inputs = page.locator(sel);
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const candidate = inputs.nth(i);
      const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);
      if (!visible) continue;

      const inStorePopin = await candidate.evaluate((el) => {
        return !!el.closest("#ctl00_WctlWCTD224_PopinManager1")
          || !!el.closest(".divWCTD224_PopinManager")
          || !!el.closest(".Annuaire__service");
      }).catch(() => false);

      if (inStorePopin) continue;

      await candidate.click({ timeout: 3000 });
      await candidate.fill("");
      await candidate.type(query, { delay: 50 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1800);

      const resultProbe = await page.evaluate(() => {
        const productIdCount = document.querySelectorAll("[data-product-id]").length;
        const ielProductCount = document.querySelectorAll("iel-product-card").length;
        const addToCartCount = Array.from(document.querySelectorAll("button, a"))
          .filter((node) => /ajouter au panier|ajouter\s*1|ajouter/i.test(String(node.textContent || ""))).length;
        const url = String(window.location.href || "").toLowerCase();
        return {
          productIdCount,
          ielProductCount,
          addToCartCount,
          isSearchUrl: /recherche|search|result/.test(url)
        };
      }).catch(() => ({ productIdCount: 0, ielProductCount: 0, addToCartCount: 0, isSearchUrl: false }));

      const hasStrongResults = resultProbe.productIdCount >= 5
        || resultProbe.ielProductCount >= 5
        || (resultProbe.isSearchUrl && resultProbe.addToCartCount >= 5);

      if (hasStrongResults) {
        log(`  Recherche fallback via input: ${sel}`);
        return;
      }
    }
  }

  // Last resort: force navigation to Leclerc search endpoints.
  const encoded = encodeURIComponent(query);
  const fallbackUrls = [
    `https://www.leclercdrive.fr/recherche?text=${encoded}`,
    `https://www.leclercdrive.fr/recherche?q=${encoded}`,
    `https://fd5-courses.leclercdrive.fr/recherche?text=${encoded}`,
    `https://fd5-courses.leclercdrive.fr/recherche?q=${encoded}`
  ];

  for (const url of fallbackUrls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1800);

      const resultProbe = await page.evaluate(() => {
        const productIdCount = document.querySelectorAll("[data-product-id]").length;
        const ielProductCount = document.querySelectorAll("iel-product-card").length;
        const addToCartCount = Array.from(document.querySelectorAll("button, a"))
          .filter((node) => /ajouter au panier|ajouter\s*1|ajouter/i.test(String(node.textContent || ""))).length;
        const href = String(window.location.href || "").toLowerCase();
        return {
          productIdCount,
          ielProductCount,
          addToCartCount,
          isSearchUrl: /recherche|search|result/.test(href)
        };
      }).catch(() => ({ productIdCount: 0, ielProductCount: 0, addToCartCount: 0, isSearchUrl: false }));

      const hasStrongResults = resultProbe.productIdCount >= 5
        || resultProbe.ielProductCount >= 5
        || (resultProbe.isSearchUrl && resultProbe.addToCartCount >= 5);

      if (hasStrongResults) {
        log(`  Recherche fallback via URL: ${url}`);
        return;
      }
    } catch (_) {
      // try next fallback URL
    }
  }

  throw new Error("Recherche fallback impossible: aucun champ ni page résultats trouvés");
}

function validateProducts(products) {
  const top10 = products.slice(0, 10);
  if (top10.length < 10) {
    return {
      ok: false,
      reason: `Seulement ${top10.length} produits extraits`
    };
  }

  for (let i = 0; i < top10.length; i++) {
    const p = top10[i] || {};
    const hasName = typeof p.name === "string" && p.name.trim().length > 0;
    const hasPrice = typeof p.unitPrice === "number" && Number.isFinite(p.unitPrice) && p.unitPrice > 0;
    const hasId = typeof p.internalId === "string" && p.internalId.trim().length > 0;

    if (!hasName || !hasPrice || !hasId) {
      return {
        ok: false,
        reason: `Produit ${i + 1} incomplet (name=${hasName}, price=${hasPrice}, id=${hasId})`
      };
    }
  }

  return { ok: true, reason: null };
}

function analyzeFailure(errorMessage, attempt) {
  const msg = String(errorMessage || "").toLowerCase();
  if (msg.includes("captcha") || msg.includes("anti-bot")) {
    return "Blocage anti-bot détecté, impossible d'adapter automatiquement sans intervention utilisateur.";
  }
  if (msg.includes("produits extraits") || msg.includes("incomplet")) {
    return `Extraction partielle à la tentative ${attempt}, extension des fallback selectors.`;
  }
  if (msg.includes("recherche")) {
    return `Echec de recherche à la tentative ${attempt}, fallback recherche renforcé.`;
  }
  return `Cause non triviale à la tentative ${attempt}, relance avec profil de sélecteurs élargi.`;
}

async function runAttempt(page, attempt) {
  const profile = ADAPTIVE_PROFILES[Math.min(attempt - 1, ADAPTIVE_PROFILES.length - 1)];
  log(`Tentative ${attempt}/${MAX_RETRIES} (profil: ${profile.label})`);

  await ensureLeclercReady(page);
  await safeClick(page, COOKIE_SELECTORS, "cookies");
  await selectStoreIfNeeded(page, CITY);

  const search = await searchProduct(page, QUERY, { timeout: 22000 });
  if (!search.success) {
    warn(`searchProduct a échoué: ${search.error}`);
    await fallbackSearch(page, QUERY);
  }

  const products = await extractProductList(page, {
    limit: 12,
    timeout: 18000,
    extraCardSelectors: profile.extraCardSelectors
  });

  const validation = validateProducts(products);
  if (!validation.ok) {
    throw new Error(validation.reason || "Validation extraction échouée");
  }

  return products.slice(0, 10);
}

async function main() {
  log("Connexion Chrome via CDP...");
  const browser = await chromium.connectOverCDP(CDP_URL);
  let context = null;

  try {
    context = browser.contexts()[0] || await browser.newContext();
    const page = await pickBestPage(context);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const top10 = await runAttempt(page, attempt);
        for (const product of top10) {
          log(`Produit: ${product.name} | ${product.unitPrice}€ | id=${product.internalId}`);
        }

        console.log("📦 Extraction réussie — 10 produits récupérés");
        return;
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        const analysis = analyzeFailure(message, attempt);
        fail(`${message}`);
        warn(`Analyse: ${analysis}`);

        if (attempt >= MAX_RETRIES) {
          throw new Error(`Echec final après ${MAX_RETRIES} tentatives: ${message}`);
        }

        // Auto-relance avec adaptation progressive des sélecteurs/profils.
        await page.waitForTimeout(1000);
      }
    }
  } finally {
    // Keep Chrome profile session alive; close CDP socket only.
    await browser.close();
  }
}

main().catch((err) => {
  fail(err.message || String(err));
  process.exitCode = 1;
});
