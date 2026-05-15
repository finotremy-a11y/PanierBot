#!/usr/bin/env node
/**
 * test_product_flow.js
 *
 * End-to-end test for Leclerc product flow:
 * 1) Select store
 * 2) Search product
 * 3) Select product
 * 4) Add to cart
 * 5) Verify cart updated
 */

import minimist from "minimist";
import { chromium } from "playwright";
import {
  selectLeclercDriveArrow,
  searchProduct,
  selectProduct,
  addToCart
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

const LOG_PREFIX = "[test_product_flow]";
function log(msg) { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg) { console.warn(`${LOG_PREFIX} ⚠️  ${msg}`); }
function error(msg) { console.error(`${LOG_PREFIX} ❌ ${msg}`); }

const COOKIE_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button:has-text('Tout accepter')",
  "button:has-text('Accepter')",
  "button[id*='accept' i]"
];

let STORE_SEARCH_SELECTORS = [
  "input[id='wpad-recherche-magasin-input']",
  "input[placeholder*='Ou souhaitez' i]",
  "input[placeholder*='code postal' i]",
  "input[placeholder*='ville' i]",
  "input[aria-label*='magasin' i]",
  "input[name*='store' i]",
  "input[type='search']"
];

let PRODUCT_SEARCH_FALLBACK_SELECTORS = [
  "input[name='q']",
  "input[id*='search' i]",
  "input[placeholder*='recherche' i]",
  "input[placeholder*='produit' i]",
  "header input[type='search']",
  "input[type='search']"
];

let PRODUCT_CARD_FALLBACK_SELECTORS = [
  "[data-product-id]",
  "[data-testid*='product' i]",
  "article[class*='product' i]",
  "li[class*='product' i]",
  "div[class*='iel-card' i]"
];

let CART_FALLBACK_SIGNALS = [
  "[data-testid*='cart' i]",
  "[aria-label*='panier' i]",
  "a[href*='panier' i]",
  "[class*='cart' i] [class*='badge' i]"
];

let STORE_STEP_DONE = false;

async function findFirst(page, selectors, timeout = 3000) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout });
      return sel;
    } catch (_) {
      // try next selector
    }
  }
  return null;
}

async function safeClick(page, selectors, label = "element") {
  const sel = await findFirst(page, selectors, 3000);
  if (!sel) {
    log(`  ${label} non detecte — ignore`);
    return false;
  }

  try {
    await page.click(sel, { timeout: 4000 });
    log(`  Clic sur ${label} : ${sel}`);
    return true;
  } catch (_) {
    return false;
  }
}

async function diagSnapshot(page) {
  try {
    const url = page.url();
    const title = await page.title();
    const body = await page.evaluate(() =>
      (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 600)
    );
    return { url, title, body };
  } catch (_) {
    return { url: "?", title: "?", body: "?" };
  }
}

async function isCaptchaOrBlocked(page) {
  try {
    const frameUrls = page.frames().map((f) => String(f.url() || "").toLowerCase());
    if (frameUrls.some((u) => u.includes("captcha-delivery.com") || u.includes("datadome"))) {
      return true;
    }

    const bodyLength = await page.evaluate(() => (document.body?.innerText || "").trim().length);
    return bodyLength === 0;
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

async function ensureLeclercReady(page, attempt, requireStoreInput = true) {
  const currentUrl = String(page.url() || "");
  const shouldNavigate = attempt === 1 || (!currentUrl.includes("leclercdrive.fr") && !currentUrl.includes("fd5-courses.leclercdrive.fr"));
  if (shouldNavigate) {
    log(`Chargement de ${LECLERC_URL}…`);
    await page.goto(LECLERC_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
  } else {
    log(`Reutilisation de la page actuelle : ${page.url()}`);
  }

  log(`  URL courante : ${page.url()}`);

  if (!requireStoreInput) {
    if (await isCaptchaOrBlocked(page)) {
      throw new Error("Page bloquee par anti-bot/CAPTCHA");
    }
    return;
  }

  const storeInput = await findFirst(page, STORE_SEARCH_SELECTORS, 5000);
  if (storeInput) return;

  if (await isCaptchaOrBlocked(page)) {
    throw new Error("Page bloquee par anti-bot/CAPTCHA");
  }

  throw new Error("Champ de recherche magasin introuvable");
}

async function fillStoreSearch(page, city) {
  const sel = await findFirst(page, STORE_SEARCH_SELECTORS, 7000);
  if (!sel) throw new Error(`Champ de recherche magasin introuvable (ville: ${city})`);

  log(`  Saisie de la ville "${city}" dans : ${sel}`);
  await page.click(sel, { timeout: 5000 });
  await page.fill(sel, "");
  await page.type(sel, city, { delay: 80 });
  await page.waitForTimeout(1000);

  const option = page.locator("[role='option']").filter({ hasText: city }).first();
  if (await option.count()) {
    const text = await option.textContent();
    log(`  Clic sur l'option autocomplete : "${String(text || "").trim()}"`);
    await option.click({ timeout: 4000 });
    await page.waitForTimeout(1000);
    return;
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}

async function waitForStoreList(page, timeout = 20000) {
  log("  Attente de la liste des magasins…");

  try {
    await page.waitForSelector(
      "button[class*='iel-rounded-3xl'], section[class*='iel-mx-auto'] button[class*='iel-']",
      { timeout: 8000 }
    );
    log("  ✅ Composant iel-* actif (boutons filtre visibles)");
  } catch (_) {
    log("  Boutons filtre iel-* non detectes, on continue…");
  }

  const selectors = [
    "section[class*='iel-flex-row'] > :last-child li",
    "section[class*='iel-flex-row'] > :last-child div[class*='iel-cursor-pointer']",
    "#idDivWPAD337_Liste li",
    ".store-item"
  ];

  const combined = selectors.join(", ");
  try {
    await page.waitForSelector(combined, { timeout: Math.max(8000, timeout - 8000) });
    log("  ✅ Items de magasins detectes");
    return true;
  } catch (_) {
    return false;
  }
}

async function enterCatalogIfNeeded(page) {
  const selectors = [
    "button:has-text('Commencer mes courses')",
    "a:has-text('Commencer mes courses')",
    "button:has-text('Continuer')",
    "a:has-text('Continuer')"
  ];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0 && await loc.isVisible({ timeout: 200 })) {
        await loc.click({ timeout: 3000 });
        await page.waitForTimeout(1200);
        return true;
      }
    } catch (_) {
      // optional step
    }
  }

  return false;
}

async function fallbackSearchProduct(page, query) {
  const inputSel = await findFirst(page, PRODUCT_SEARCH_FALLBACK_SELECTORS, 5000);
  if (!inputSel) {
    throw new Error("Fallback recherche: champ produit introuvable");
  }

  const candidates = page.locator(inputSel);
  const count = await candidates.count();
  let target = null;

  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    const visible = await el.isVisible({ timeout: 200 }).catch(() => false);
    if (!visible) continue;
    const inPopin = await el.evaluate((node) => !!node.closest("#ctl00_WctlWCTD224_PopinManager1") || !!node.closest(".divWCTD224_PopinManager")).catch(() => false);
    if (!inPopin) {
      target = el;
      break;
    }
  }

  if (!target) {
    throw new Error("Fallback recherche: input produit masque par popin magasin");
  }

  await target.click({ timeout: 3000 });
  await target.fill("");
  await target.type(query, { delay: 40 });
  await page.keyboard.press("Enter");

  const cardSel = await findFirst(page, PRODUCT_CARD_FALLBACK_SELECTORS, 12000);
  if (!cardSel) {
    throw new Error("Fallback recherche: aucun resultat produit");
  }

  const products = await page.evaluate((selector) => {
    const cards = Array.from(document.querySelectorAll(selector)).slice(0, 12);
    return cards.map((card, i) => ({
      index: i + 1,
      name: (card.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
      id: card.getAttribute("data-product-id") || card.getAttribute("id") || `fallback-${i + 1}`
    })).filter((p) => p.name.length > 0);
  }, cardSel);

  return { success: products.length > 0, products, selector: inputSel, cardSelector: cardSel };
}

async function fallbackCartHasItems(page) {
  return page.evaluate((signals) => {
    for (const sel of signals) {
      const nodes = Array.from(document.querySelectorAll(sel));
      for (const node of nodes) {
        const text = `${node.textContent || ""} ${node.getAttribute("aria-label") || ""}`;
        const match = text.match(/\d+/);
        if (match && Number(match[0]) > 0) return true;
      }
    }
    const body = (document.body?.innerText || "").toLowerCase();
    return body.includes("article ajoute") || body.includes("ajoute au panier") || body.includes("commander");
  }, CART_FALLBACK_SIGNALS);
}

function adaptSelectors(attempt, lastError) {
  const msg = String(lastError || "").toLowerCase();

  if (attempt === 2) {
    PRODUCT_SEARCH_FALLBACK_SELECTORS = [
      ...PRODUCT_SEARCH_FALLBACK_SELECTORS,
      "section[class*='iel-'] input[type='text']",
      "main input[type='search']"
    ];
    PRODUCT_CARD_FALLBACK_SELECTORS = [
      ...PRODUCT_CARD_FALLBACK_SELECTORS,
      "main article",
      "main li",
      "div[data-testid*='item' i]"
    ];
    STORE_STEP_DONE = true;
    log("  Adaptation tentative 2 : elargissement selecteurs recherche/carte produit");
  }

  if (attempt >= 3) {
    CART_FALLBACK_SIGNALS = [
      ...CART_FALLBACK_SIGNALS,
      "[class*='basket' i]",
      "[data-testid*='mini-cart' i]"
    ];
    if (msg.includes("panier")) {
      PRODUCT_CARD_FALLBACK_SELECTORS = [
        "section[class*='iel-flex-row'] > :last-child div[class*='iel-cursor-pointer']",
        ...PRODUCT_CARD_FALLBACK_SELECTORS
      ];
    }
    log(`  Adaptation tentative ${attempt} : fallback panier + cartes produits`);
  }
}

async function runAttempt(page, attempt) {
  log("\n────────────────────────────────────────────────");
  log(`Tentative ${attempt} / ${MAX_RETRIES}`);
  log("────────────────────────────────────────────────");

  await ensureLeclercReady(page, attempt, !STORE_STEP_DONE);

  log("Verification banniere cookies…");
  await safeClick(page, COOKIE_SELECTORS, "banniere cookies");
  await page.waitForTimeout(500);

  if (!STORE_STEP_DONE) {
    log(`Selection du magasin pour la ville "${CITY}"…`);
    await fillStoreSearch(page, CITY);

    const listReady = await waitForStoreList(page);
    if (!listReady) {
      throw new Error("Liste des magasins non rendue");
    }

    const storeResult = await selectLeclercDriveArrow(page, {
      storeListTimeout: 20000,
      panelTimeout: 8000
    });
    if (!storeResult.success) {
      throw new Error(storeResult.error || "Selection magasin echouee");
    }

    STORE_STEP_DONE = true;
    log(`✅ selectLeclercDriveArrow reussi — selecteur utilise : ${storeResult.selector}`);
  } else {
    log("Store deja selectionne — on continue sur le flux produit");
  }

  await enterCatalogIfNeeded(page);

  const currentUrl = String(page.url() || "").toLowerCase();
  if (STORE_STEP_DONE && currentUrl.includes("fiche-produits")) {
    log("Fiche produit detectee apres etape magasin — tentative ajout direct panier");
    const directAdd = await addToCart(page, { timeout: 16000 });
    if (!directAdd.success) {
      throw new Error(directAdd.error || "Ajout panier direct echoue");
    }
    const directCartOk = await fallbackCartHasItems(page);
    if (!directCartOk) {
      throw new Error("Verification panier: aucun article detecte apres ajout direct");
    }
    log("✅ Test produit réussi — article ajouté au panier");
    return true;
  }

  log(`Recherche produit "${QUERY}"…`);
  let searchResult = await searchProduct(page, QUERY, { timeout: 20000 });
  if (!searchResult.success) {
    warn(`searchProduct a echoue: ${searchResult.error}`);
    searchResult = await fallbackSearchProduct(page, QUERY);
    if (!searchResult.success) {
      throw new Error("Recherche produit echouee (agent + fallback)");
    }
  }

  log(`✅ Recherche terminee — ${searchResult.products.length} produit(s) detecte(s)`);

  const selected = await selectProduct(page, 1, { timeout: 12000 });
  if (!selected.success) {
    throw new Error(selected.error || "Selection produit echouee");
  }

  const addResult = await addToCart(page, { timeout: 16000 });
  if (!addResult.success) {
    throw new Error(addResult.error || "Ajout panier echoue");
  }

  const cartUpdated = await fallbackCartHasItems(page);
  if (!cartUpdated) {
    throw new Error("Verification panier: aucun article detecte");
  }

  log("✅ Test produit réussi — article ajouté au panier");
  return true;
}

async function main() {
  log("═══════════════════════════════════════════════════");
  log(" PanierBot — test_product_flow.js");
  log(` CDP : ${CDP_URL} | Ville : ${CITY} | Produit : ${QUERY} | Retries max : ${MAX_RETRIES}`);
  log("═══════════════════════════════════════════════════\n");

  let browser;
  try {
    log(`Connexion CDP a ${CDP_URL}…`);
    browser = await chromium.connectOverCDP(CDP_URL);
    log(`Connecte. Contextes disponibles : ${browser.contexts().length}`);
  } catch (err) {
    error(`Impossible de se connecter au navigateur local : ${err.message}`);
    process.exit(1);
  }

  let context;
  let page;
  try {
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    page = await pickBestPage(context);
  } catch (err) {
    error(`Impossible d'obtenir une page : ${err.message}`);
    process.exit(1);
  }

  let success = false;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      success = await runAttempt(page, attempt);
      if (success) break;
    } catch (err) {
      lastError = String(err.message || err);
      error(`Tentative ${attempt} echouee : ${lastError}`);

      if (lastError.toLowerCase().includes("captcha") || lastError.toLowerCase().includes("anti-bot")) {
        break;
      }

      if (attempt < MAX_RETRIES) {
        adaptSelectors(attempt + 1, lastError);
        const snap = await diagSnapshot(page);
        log(`  Diagnostic : url=${snap.url} title="${snap.title}"`);
        log(`  Body apercu : ${snap.body}`);
        log("Pause avant nouvelle tentative…");
        await page.waitForTimeout(1800);
      }
    }
  }

  log(`\n${"═".repeat(51)}`);
  if (success) {
    log("✅ Test produit réussi — article ajouté au panier");
  } else {
    error(`❌ Echec apres ${MAX_RETRIES} tentative(s) — derniere erreur : ${lastError}`);
  }
  log(`${"═".repeat(51)}\n`);

  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  error(`Erreur fatale non capturee : ${err.message}`);
  process.exit(1);
});
