#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import minimist from "minimist";
import { chromium } from "playwright";
import {
  searchCarrefourProduct,
  searchIntermarcheProduct,
  searchLeclercProduct,
  searchSuperUProduct,
  selectCarrefourStore,
  selectIntermarcheStore,
  selectLeclercDriveArrow,
  selectSuperUStore,
  extractCarrefourProductList,
  extractIntermarcheProductList,
  extractLeclercProductList,
  extractSuperUProductList
} from "./agents/navigator_agent.js";

const DEFAULT_CDP_URL = "http://localhost:9222";
const DEFAULT_MONITOR_PATH = path.resolve(process.cwd(), "logs", "selectors.json");
const CRITICAL_KEYS = ["searchBar", "productCards", "price", "pricePerKg", "addToCart"];

const STORE_MONITOR_DEFINITIONS = Object.freeze({
  leclerc: {
    label: "Leclerc",
    homeUrl: "https://www.leclercdrive.fr/",
    select: (page, city, profile) => selectLeclercDriveArrow(page, {
      city,
      storeListTimeout: profile.storeListTimeout,
      panelTimeout: profile.panelTimeout
    }),
    search: searchLeclercProduct,
    extract: extractLeclercProductList
  },
  carrefour: {
    label: "Carrefour",
    homeUrl: "https://www.carrefour.fr/services/drive",
    select: (page, city, profile) => selectCarrefourStore(page, city, {
      timeout: profile.timeout,
      extraStoreSearchSelectors: profile.extraStoreSearchSelectors,
      extraStoreCardSelectors: profile.extraStoreCardSelectors,
      extraStoreButtonSelectors: profile.extraStoreButtonSelectors
    }),
    search: searchCarrefourProduct,
    extract: extractCarrefourProductList
  },
  intermarche: {
    label: "Intermarche",
    homeUrl: "https://www.intermarche.com",
    select: (page, city, profile) => selectIntermarcheStore(page, city, {
      timeout: profile.timeout,
      extraStoreSearchSelectors: profile.extraStoreSearchSelectors,
      extraStoreCardSelectors: profile.extraStoreCardSelectors,
      extraStoreButtonSelectors: profile.extraStoreButtonSelectors
    }),
    search: searchIntermarcheProduct,
    extract: extractIntermarcheProductList
  },
  superu: {
    label: "Super U",
    homeUrl: "https://www.coursesu.com/",
    select: (page, city, profile) => selectSuperUStore(page, city, {
      timeout: profile.timeout,
      extraStoreSearchSelectors: profile.extraStoreSearchSelectors,
      extraStoreCardSelectors: profile.extraStoreCardSelectors,
      extraStoreButtonSelectors: profile.extraStoreButtonSelectors
    }),
    search: searchSuperUProduct,
    extract: extractSuperUProductList
  }
});

const MONITOR_PROFILES = Object.freeze([
  {
    label: "react-data-testid",
    timeout: 35000,
    storeListTimeout: 25000,
    panelTimeout: 12000,
    extraStoreSearchSelectors: ["input[name='search']", "input[data-testid*='store-search' i]", "input[data-testid*='store' i]"],
    extraStoreCardSelectors: ["[data-testid='store-card']", "[data-testid*='store-card' i]", "[data-testid*='store-result' i]"],
    extraStoreButtonSelectors: ["button[data-testid*='select' i]", "button[data-testid*='choose' i]", "button:has-text('Choisir')"],
    extraSearchSelectors: ["input[name='search']", "input[data-testid*='search' i]"],
    extraSubmitSelectors: ["button[data-testid*='search' i]"],
    extraProductCardSelectors: ["[data-testid='product-card']", "[data-testid*='product-card' i]"],
    extraAddSelectors: ["button[data-testid*='add' i]", "button[aria-label*='ajouter' i]"]
  },
  {
    label: "generic-react-cards",
    timeout: 32000,
    storeListTimeout: 22000,
    panelTimeout: 10000,
    extraStoreSearchSelectors: ["input[type='search']", "input[placeholder*='ville' i]"],
    extraStoreCardSelectors: ["article[class*='store' i]", "li[class*='store' i]", "div[class*='store-card' i]"],
    extraStoreButtonSelectors: ["button:has-text('Choisir')", "button:has-text('Selectionner')", "button:has-text('Continuer')"],
    extraSearchSelectors: ["input[name='q']", "input[placeholder*='recherche' i]", "input[placeholder*='produit' i]"],
    extraSubmitSelectors: ["button[type='submit']", "button[aria-label*='recherche' i]"],
    extraProductCardSelectors: ["[data-testid*='product' i]", "article[class*='product' i]", "div[class*='product-card' i]"],
    extraAddSelectors: ["button:has-text('Ajouter')", "button:has-text('Ajouter au panier')"]
  },
  {
    label: "legacy-fallback",
    timeout: 28000,
    storeListTimeout: 20000,
    panelTimeout: 9000,
    extraStoreSearchSelectors: ["input[placeholder*='ville' i]", "input[name*='store' i]", "input[aria-label*='magasin' i]"],
    extraStoreCardSelectors: ["[class*='store' i][class*='card' i]", "[class*='storeCard' i]"],
    extraStoreButtonSelectors: ["button:has-text('Valider')", "button:has-text('Continuer')"],
    extraSearchSelectors: ["input[type='search']", "input[aria-label*='rechercher' i]"],
    extraSubmitSelectors: ["button[aria-label*='lancer la recherche' i]", "form button[type='submit']"],
    extraProductCardSelectors: ["div.by_content", "div.by_wrapper", "article[data-product-id]"],
    extraAddSelectors: ["button[class*='add' i]", "button[class*='cart' i]"]
  }
]);

const DEFAULT_SELECTOR_REGISTRY = Object.freeze({
  leclerc: {
    searchBar: ["input[name='q']", "input[type='search']", "input[placeholder*='recherche' i]", "header input[type='search']"],
    productCards: ["li.liWCRS310_Product", "[data-product-id]", "article[class*='product' i]", "li[class*='product' i]"],
    price: ["[class*='price' i]", "[data-testid*='price' i]", ".pWCRS310_PrixUnitaire"],
    pricePerKg: ["[class*='PrixUniteMesure' i]", "[class*='unit' i]", "[class*='kg' i]"],
    addToCart: ["a.aWCRS310_Add_Produit_Fiche", "button:has-text('Ajouter au panier')", "button:has-text('Ajouter')"]
  },
  carrefour: {
    searchBar: ["input[name='q']", "#vendor-search-handler", "input[type='search']", "input[aria-label*='rechercher' i]"],
    productCards: [".product-list-card-plp-grid-new", "[data-testid='product-card']", "div.by_wrapper", "article[class*='product' i]"],
    price: ["div.by_price", "[class*='price' i]", "[data-testid*='price' i]"],
    pricePerKg: ["div.by_mentions", "[class*='unit' i]", "[data-testid*='price-per' i]"],
    addToCart: ["button[aria-label*='Ajouter' i]", "button[label='Acheter']", "button:has-text('Ajouter')"]
  },
  intermarche: {
    searchBar: ["input[name='search']", "input[name='q']", "input[type='search']", "input[placeholder*='recherche' i]"],
    productCards: ["[data-testid='product-card']", "article[class*='product' i]", "li[class*='product' i]", "section article"],
    price: ["[data-testid*='price' i]", "[class*='price' i]", "[class*='tarif' i]"],
    pricePerKg: ["[data-testid*='price-per' i]", "[class*='unit' i]", "[class*='kg' i]"],
    addToCart: ["button[data-testid*='add' i]", "button:has-text('Ajouter au panier')", "button:has-text('Ajouter')"]
  },
  superu: {
    searchBar: ["input[type='search']", "input[name='search']", "input[name='q']", "input[placeholder*='recherche' i]"],
    productCards: [".search-result-items > li", ".product-tile", "[data-testid='product-card']", "article[class*='product' i]"],
    price: ["[class*='price' i]", "[data-testid*='price' i]", ".product-tile [class*='amount' i]"],
    pricePerKg: ["[class*='unit' i]", "[class*='kg' i]", "[data-testid*='price-per' i]"],
    addToCart: ["button[data-testid*='add' i]", "button:has-text('Ajouter au panier')", "button:has-text('Ajouter')"]
  }
});

function nowIso() {
  return new Date().toISOString();
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeStoreRegistry(payload, storeKey) {
  const base = payload?.stores?.[storeKey] || {};
  const defaults = DEFAULT_SELECTOR_REGISTRY[storeKey] || {};
  const critical = {};

  for (const key of CRITICAL_KEYS) {
    const fromFile = base?.critical?.[key] || {};
    const defaultsForKey = defaults[key] || [];
    const current = String(fromFile.current || defaultsForKey[0] || "").trim() || null;
    const fallbacks = unique([
      ...(Array.isArray(fromFile.fallbacks) ? fromFile.fallbacks : []),
      ...defaultsForKey
    ]);

    critical[key] = {
      current,
      fallbacks,
      broken: Array.isArray(fromFile.broken) ? fromFile.broken : [],
      history: Array.isArray(fromFile.history) ? fromFile.history : []
    };
  }

  return {
    critical
  };
}

async function loadMonitorState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid json");
    }

    return {
      version: Number(parsed.version) || 1,
      createdAt: parsed.createdAt || nowIso(),
      updatedAt: parsed.updatedAt || nowIso(),
      stores: {
        leclerc: normalizeStoreRegistry(parsed, "leclerc"),
        carrefour: normalizeStoreRegistry(parsed, "carrefour"),
        intermarche: normalizeStoreRegistry(parsed, "intermarche"),
        superu: normalizeStoreRegistry(parsed, "superu")
      }
    };
  } catch (_) {
    const createdAt = nowIso();
    return {
      version: 1,
      createdAt,
      updatedAt: createdAt,
      stores: {
        leclerc: normalizeStoreRegistry({}, "leclerc"),
        carrefour: normalizeStoreRegistry({}, "carrefour"),
        intermarche: normalizeStoreRegistry({}, "intermarche"),
        superu: normalizeStoreRegistry({}, "superu")
      }
    };
  }
}

async function persistMonitorState(state, filePath) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  state.updatedAt = nowIso();
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

async function ensureHomePage(page, homeUrl) {
  const current = String(page.url() || "").toLowerCase();
  const hostNeedle = String(homeUrl || "").toLowerCase().replace(/^https?:\/\//, "");
  if (!current.includes(hostNeedle)) {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function testSelector(page, selector) {
  if (!selector) {
    return false;
  }

  try {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count <= 0) {
      return false;
    }

    const visible = await locator.isVisible({ timeout: 250 }).catch(() => false);
    return visible || count > 0;
  } catch (_) {
    return false;
  }
}

function generateMonitorOptions(criticalConfig, profile) {
  const searchList = unique([
    criticalConfig.searchBar.current,
    ...criticalConfig.searchBar.fallbacks,
    ...(profile.extraSearchSelectors || [])
  ]).slice(0, 8);

  const cardList = unique([
    criticalConfig.productCards.current,
    ...criticalConfig.productCards.fallbacks,
    ...(profile.extraProductCardSelectors || [])
  ]).slice(0, 10);

  const addList = unique([
    criticalConfig.addToCart.current,
    ...criticalConfig.addToCart.fallbacks,
    ...(profile.extraAddSelectors || [])
  ]).slice(0, 8);

  return {
    extraSearchSelectors: searchList,
    extraSubmitSelectors: profile.extraSubmitSelectors,
    extraProductCardSelectors: cardList,
    extraAddSelectors: addList,
    timeout: profile.timeout
  };
}

async function discoverFallbackSelectors(page, criticalKey) {
  const generated = await page.evaluate((kind) => {
    const sanitizeClass = (value) => String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
    const toSelector = (el) => {
      if (!(el instanceof Element)) return null;
      if (el.id) return `#${el.id}`;
      const tag = String(el.tagName || "").toLowerCase();
      if (!tag) return null;
      const classes = Array.from(el.classList || []).slice(0, 2).map(sanitizeClass).filter(Boolean);
      if (classes.length > 0) {
        return `${tag}.${classes.join(".")}`;
      }
      return tag;
    };

    const inViewport = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };

    const pick = (nodes) => {
      const out = [];
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        if (!inViewport(node)) continue;
        const selector = toSelector(node);
        if (selector && !out.includes(selector)) {
          out.push(selector);
        }
        if (out.length >= 8) break;
      }
      return out;
    };

    if (kind === "searchBar") {
      return pick(document.querySelectorAll("input[type='search'], input[name*='search' i], input[name='q'], header input, [role='search'] input"));
    }

    if (kind === "productCards") {
      return pick(document.querySelectorAll("[data-testid*='product' i], article[class*='product' i], li[class*='product' i], div[class*='product-card' i], .product-tile, .by_wrapper"));
    }

    if (kind === "price") {
      return pick(document.querySelectorAll("[data-testid*='price' i], [class*='price' i], [class*='amount' i], .by_price"));
    }

    if (kind === "pricePerKg") {
      return pick(document.querySelectorAll("[data-testid*='price-per' i], [class*='unit' i], [class*='kg' i], [class*='litre' i], .by_mentions"));
    }

    if (kind === "addToCart") {
      const buttons = Array.from(document.querySelectorAll("button, a")).filter((node) => {
        const text = String(node.textContent || node.getAttribute("aria-label") || "").toLowerCase();
        return text.includes("ajouter") || text.includes("panier") || text.includes("acheter");
      });
      return pick(buttons);
    }

    return [];
  }, criticalKey).catch(() => []);

  return unique(generated);
}

function trackBrokenSelector(criticalConfig, selector, reason, { store = null, url = null } = {}) {
  const message = String(reason || "selector not found");
  criticalConfig.broken.push({
    store,
    selector,
    reason: message,
    url,
    at: nowIso()
  });

  if (criticalConfig.broken.length > 50) {
    criticalConfig.broken.splice(0, criticalConfig.broken.length - 50);
  }
}

function promoteSelector(criticalConfig, promoted, source) {
  criticalConfig.current = promoted;
  criticalConfig.fallbacks = unique([promoted, ...criticalConfig.fallbacks]);
  criticalConfig.history.push({
    event: "promoted",
    selector: promoted,
    source,
    at: nowIso()
  });

  if (criticalConfig.history.length > 120) {
    criticalConfig.history.splice(0, criticalConfig.history.length - 120);
  }
}

async function repairCriticalSelector({ page, storeKey, criticalKey, state, iteration }) {
  const storeConfig = state.stores[storeKey];
  const criticalConfig = storeConfig.critical[criticalKey];
  const current = criticalConfig.current;

  if (await testSelector(page, current)) {
    return {
      repaired: false,
      ok: true,
      selector: current
    };
  }

  const currentUrl = await page.url();
  console.warn(`🔎 Sélecteur cassé détecté | store=${storeKey} | cible=${criticalKey} | selector=${current || "<none>"} | url=${currentUrl}`);
  trackBrokenSelector(criticalConfig, current, `iteration ${iteration}: selector introuvable`, { store: storeKey, url: currentUrl });

  const discovered = await discoverFallbackSelectors(page, criticalKey);
  const candidates = unique([
    ...criticalConfig.fallbacks,
    ...discovered
  ]);

  for (const candidate of candidates) {
    if (!candidate || candidate === current) {
      continue;
    }

    const works = await testSelector(page, candidate);
    if (!works) {
      continue;
    }

    console.log(`🛠 Correction automatique appliquée | store=${storeKey} | cible=${criticalKey} | fallback=${candidate}`);
    promoteSelector(criticalConfig, candidate, "auto-fallback");
    console.log(`🟢 Sélecteur réparé | store=${storeKey} | cible=${criticalKey} | selector=${candidate}`);

    return {
      repaired: true,
      ok: true,
      selector: candidate
    };
  }

  return {
    repaired: false,
    ok: false,
    selector: current
  };
}

async function monitorExtraction({ page, storeKey, state, maxAutocorrectAttempts }) {
  let rounds = 0;

  while (rounds < maxAutocorrectAttempts) {
    rounds += 1;

    const statuses = [];
    for (const criticalKey of CRITICAL_KEYS) {
      const status = await repairCriticalSelector({
        page,
        storeKey,
        criticalKey,
        state,
        iteration: rounds
      });
      statuses.push({ criticalKey, ...status });
    }

    const unresolved = statuses.filter((entry) => !entry.ok);
    if (unresolved.length === 0) {
      return {
        success: true,
        rounds,
        statuses
      };
    }
  }

  const failed = CRITICAL_KEYS.filter((key) => {
    const current = state.stores[storeKey].critical[key].current;
    return !current;
  });

  return {
    success: false,
    rounds,
    failed
  };
}

async function runStoreDiagnostic({
  browser,
  storeKey,
  city,
  query,
  maxRetries,
  maxAutocorrectAttempts,
  state
}) {
  const definition = STORE_MONITOR_DEFINITIONS[storeKey];
  if (!definition) {
    throw new Error(`Enseigne inconnue: ${storeKey}`);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => String(p.url() || "").includes(storeKey)) || await context.newPage();

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const profile = MONITOR_PROFILES[(attempt - 1) % MONITOR_PROFILES.length];
    await ensureHomePage(page, definition.homeUrl);

    const selectResult = await definition.select(page, city, profile);
    if (selectResult && selectResult.success === false) {
      if (attempt === maxRetries) {
        throw new Error(`${definition.label}: sélection magasin échouée (${selectResult.error || "inconnue"})`);
      }
      continue;
    }

    const monitorOptions = generateMonitorOptions(state.stores[storeKey].critical, profile);
    const searchResult = await definition.search(page, query, monitorOptions);
    if (!searchResult || searchResult.success === false) {
      if (attempt === maxRetries) {
        throw new Error(`${definition.label}: recherche échouée (${searchResult?.error || "inconnue"})`);
      }
      continue;
    }

    const extracted = await definition.extract(page, {
      limit: 12,
      timeout: profile.timeout,
      extraCardSelectors: monitorOptions.extraProductCardSelectors
    });

    const extractedProducts = Array.isArray(extracted) ? extracted : [];
    if (extractedProducts.length === 0 && attempt === maxRetries) {
      throw new Error(`${definition.label}: extraction vide`);
    }

    const monitorResult = await monitorExtraction({
      page,
      storeKey,
      state,
      maxAutocorrectAttempts
    });

    if (!monitorResult.success && attempt === maxRetries) {
      throw new Error(`${definition.label}: certains sélecteurs restent cassés après auto-correction`);
    }

    if (monitorResult.success) {
      return {
        storeKey,
        label: definition.label,
        extractedCount: extractedProducts.length,
        rounds: monitorResult.rounds
      };
    }
  }

  throw new Error(`${definition.label}: diagnostic impossible`);
}

async function runDiagnosticMode(args) {
  const state = await loadMonitorState(args.output);

  let browser = null;
  try {
    browser = await chromium.connectOverCDP(args.cdpUrl || DEFAULT_CDP_URL);
  } catch (error) {
    throw new Error(`CDP indisponible: ${error.message}`);
  }

  try {
    const stores = ["leclerc", "carrefour", "intermarche", "superu"];
    const results = [];

    for (const storeKey of stores) {
      const result = await runStoreDiagnostic({
        browser,
        storeKey,
        city: args.city,
        query: args.query,
        maxRetries: args.maxRetries,
        maxAutocorrectAttempts: args.autocorrectAttempts,
        state
      });
      results.push(result);
    }

    await persistMonitorState(state, args.output);

    for (const result of results) {
      console.log(`✅ Diagnostic ${result.label}: ${result.extractedCount} produits, ${result.rounds} passe(s) monitor`);
    }

    console.log("🟢 Monitoring sélecteurs opérationnel");
    return { success: true };
  } finally {
    // Keep external CDP browser alive.
  }
}

function parseArgs() {
  const args = minimist(process.argv.slice(2), {
    string: ["mode", "city", "query", "cdp-url", "output"],
    default: {
      mode: "diagnostic",
      city: "Paris",
      query: "pâtes",
      "max-retries": 4,
      "autocorrect-attempts": 6,
      "cdp-url": DEFAULT_CDP_URL,
      output: DEFAULT_MONITOR_PATH
    }
  });

  const readArg = (value, fallback) => {
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      return String(last ?? fallback);
    }
    if (value === undefined || value === null) {
      return String(fallback);
    }
    return String(value);
  };

  return {
    mode: readArg(args.mode, "diagnostic").toLowerCase(),
    city: readArg(args.city, "Paris"),
    query: readArg(args.query, "pâtes"),
    cdpUrl: readArg(args["cdp-url"], DEFAULT_CDP_URL),
    maxRetries: Math.max(1, parseInt(readArg(args["max-retries"], "4"), 10)),
    autocorrectAttempts: Math.max(1, parseInt(readArg(args["autocorrect-attempts"], "6"), 10)),
    output: path.resolve(process.cwd(), readArg(args.output, DEFAULT_MONITOR_PATH))
  };
}

async function main() {
  const args = parseArgs();

  if (args.mode !== "diagnostic") {
    throw new Error(`Mode non supporté: ${args.mode} (mode attendu: diagnostic)`);
  }

  const result = await runDiagnosticMode(args);
  if (!result.success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`❌ selector_monitor: ${error.message}`);
  process.exit(1);
});
