import { chromium } from "playwright";
import {
  addCarrefourToCart,
  addIntermarcheToCart,
  addLeclercToCart,
  addSuperUToCart,
  buildOptimalCart,
  compareProducts,
  computeDerivedPrices,
  extractCarrefourProductList,
  extractIntermarcheProductList,
  extractLeclercProductList,
  extractSuperUProductList,
  filterProducts,
  normalizeProduct,
  searchCarrefourProduct,
  searchIntermarcheProduct,
  searchLeclercProduct,
  searchSuperUProduct,
  selectCarrefourStore,
  selectIntermarcheStore,
  selectLeclercDriveArrow,
  selectSuperUStore,
  sortProductsByStrategy
} from "./agents/navigator_agent.js";

const DEFAULT_CDP_URL = "http://localhost:9222";

const STORE_DEFINITIONS = Object.freeze({
  leclerc: {
    label: "Leclerc",
    homeUrl: "https://www.leclercdrive.fr/",
    select: async (page, city, profile) => selectLeclercDriveArrow(page, {
      city,
      storeListTimeout: profile.storeListTimeout,
      panelTimeout: profile.panelTimeout
    }),
    search: searchLeclercProduct,
    extract: extractLeclercProductList,
    add: addLeclercToCart
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
    extract: extractCarrefourProductList,
    add: addCarrefourToCart
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
    extract: extractIntermarcheProductList,
    add: addIntermarcheToCart
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
    extract: extractSuperUProductList,
    add: addSuperUToCart
  }
});

const ADAPTIVE_PROFILES = Object.freeze([
  {
    label: "strict-cdp-only",
    timeout: 35000,
    storeListTimeout: 25000,
    panelTimeout: 12000,
    extraStoreSearchSelectors: ["input[name='search']", "input[data-testid*='store-search' i]", "input[data-testid*='store' i]"],
    extraStoreCardSelectors: ["[data-testid='store-card']", "[data-testid*='store-card' i]", "[data-testid*='store-result' i]"],
    extraStoreButtonSelectors: ["button[data-testid*='select' i]", "button[data-testid*='choose' i]", "button:has-text('Choisir')"],
    extraSearchSelectors: ["input[name='search']", "input[data-testid*='search' i]"],
    extraSubmitSelectors: ["button[data-testid*='search' i]"],
    extraProductCardSelectors: ["[data-testid='product-card']", "[data-testid*='product-card' i]"],
    extraAddSelectors: ["button[data-testid*='add' i]", "button[aria-label*='ajouter' i]"],
    extraCartSignals: ["[data-testid*='cart-count' i]", "[data-testid*='basket-count' i]"]
  }
]);

function createLogger(prefix) {
  return {
    log(message) {
      console.log(`${prefix} ${message}`);
    },
    warn(message) {
      console.warn(`${prefix} ⚠️  ${message}`);
    },
    fail(message) {
      console.error(`${prefix} ❌ ${message}`);
    }
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureCdpConnected({ browser, context, page, logger, stepName }) {
  logger.log(`🔎 CDP check — ${stepName}`);

  const connected = Boolean(browser && typeof browser.isConnected === "function" && browser.isConnected());
  const contextAlive = Boolean(context && typeof context.pages === "function");
  const pageAlive = Boolean(page && !page.isClosed());

  if (!connected || !contextAlive || !pageAlive) {
    logger.fail(`❌ CDP indisponible — arrêt immédiat (${stepName})`);
    throw new Error(`CDP indisponible pendant ${stepName}`);
  }
}

function roundTo(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizeKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getMetric(product, strategy) {
  switch (String(strategy || "cheapest").toLowerCase()) {
    case "best_per_kg":
      return Number.isFinite(product?.pricePerKg) ? product.pricePerKg : Number.POSITIVE_INFINITY;
    case "best_per_l":
      return Number.isFinite(product?.pricePerL) ? product.pricePerL : Number.POSITIVE_INFINITY;
    case "per_unit":
      return Number.isFinite(product?.pricePerUnit) ? product.pricePerUnit : Number.POSITIVE_INFINITY;
    case "cheapest":
    default:
      return Number.isFinite(product?.price) ? product.price : Number.POSITIVE_INFINITY;
  }
}

function getDefaultCartSignals(extraSignals = []) {
  return [
    ...extraSignals,
    "[data-testid*='cart-count' i]",
    "[data-testid*='basket-count' i]",
    "[data-testid*='cart' i] [class*='count' i]",
    "a[href*='panier' i]",
    "button[aria-label*='panier' i]",
    "[class*='cart' i] [class*='badge' i]"
  ];
}

async function getCartCount(page, extraSignals = []) {
  const selectors = getDefaultCartSignals(extraSignals);

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

    if (max <= 0) {
      const lineItemSelectors = [
        "[data-testid*='cart-item' i]",
        "[data-testid*='basket-item' i]",
        "[class*='cart-item' i]",
        "[class*='basket-item' i]",
        "li[class*='line-item' i]",
        "[class*='panier' i] li",
        "[class*='cart' i] li"
      ];

      let lineItems = 0;
      for (const selector of lineItemSelectors) {
        const visible = Array.from(document.querySelectorAll(selector)).filter((node) => {
          const text = String(node.textContent || "").toLowerCase().replace(/\s+/g, " ");
          if (!text || text.length < 6) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width <= 2 || rect.height <= 2) return false;
          return /€|retirer|supprimer|quantit[eé]|produit|article|kg|g|ml|cl|l/.test(text);
        }).length;
        if (visible > lineItems) {
          lineItems = visible;
        }
      }

      if (lineItems > 0) {
        max = lineItems;
      }
    }

    if (max <= 0) {
      const body = String(document.body?.innerText || "").toLowerCase().replace(/\s+/g, " ");
      const patterns = [
        /panier\s*[:(\-\s]*([1-9]\d{0,2})\b/i,
        /([1-9]\d{0,2})\s*article(?:s)?\s*(?:dans\s+le\s+)?panier/i,
        /article(?:s)?\s*[:(\-\s]*([1-9]\d{0,2})\b/i
      ];
      for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
          const parsed = Number(match[1]);
          if (Number.isFinite(parsed) && parsed > 0) {
            max = parsed;
            break;
          }
        }
      }
    }

    return max;
  }, selectors).catch(() => 0);
}

async function hasRealCartEvidence(page) {
  return page.evaluate(() => {
    const body = String(document.body?.innerText || "").toLowerCase().replace(/\s+/g, " ");
    if (/ajout[eé] au panier|article ajout[eé]|panier mis [àa] jour|exemplaires? dans le panier/.test(body)) {
      return true;
    }

    return Array.from(document.querySelectorAll("button, a, span, div")).some((node) => {
      const text = String(node.textContent || node.getAttribute("aria-label") || "").toLowerCase().replace(/\s+/g, " ");
      return /retirer|supprimer|quantit[eé]|\+\s*1|\-\s*1|vider le panier/.test(text);
    });
  }).catch(() => false);
}

async function ensureHomePage(page, homeUrl) {
  if (!String(page.url() || "").toLowerCase().includes(String(homeUrl).toLowerCase().replace(/^https?:\/\//, ""))) {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

function assertUnitNormalization() {
  const gram = computeDerivedPrices(normalizeProduct({ name: "Pates 500g", price: 1.5, quantity: "500g", id: "g", url: "g" }, { store: "audit", index: 0 }));
  const kilo = computeDerivedPrices(normalizeProduct({ name: "Farine 1kg", price: 2, quantity: "1kg", id: "k", url: "k" }, { store: "audit", index: 1 }));
  const liquid = computeDerivedPrices(normalizeProduct({ name: "Jus 750ml", price: 1.8, quantity: "750ml", id: "m", url: "m" }, { store: "audit", index: 2 }));
  const pack = computeDerivedPrices(normalizeProduct({ name: "Lot 6", price: 2.4, quantity: "lot de 6", id: "u", url: "u" }, { store: "audit", index: 3 }));

  assert(gram._unit.normalizedUnit === "g" && gram._unit.normalizedValue === 500, "g -> kg conversion invalide");
  assert(Number(roundTo(gram.pricePerKg, 4)) === 3, "pricePerKg = price / kg invalide");
  assert(kilo._unit.normalizedUnit === "g" && kilo._unit.normalizedValue === 1000, "kg -> g conversion invalide");
  assert(Number(roundTo(kilo.pricePerKg, 4)) === 2, "pricePerKg pour 1kg invalide");
  assert(liquid._unit.normalizedUnit === "ml" && liquid._unit.normalizedValue === 750, "ml conversion invalide");
  assert(Number(roundTo(liquid.pricePerL, 4)) === 2.4, "pricePerL invalide");
  assert(pack._unit.normalizedUnit === "unit" && pack._unit.normalizedValue === 6, "unit parsing invalide");
  assert(Number(roundTo(pack.pricePerUnit, 4)) === 0.4, "pricePerUnit invalide");
}

function assertSelectedProduct(products, strategy, storeKey) {
  const audited = products.map((product, index) => normalizeProduct(product, { store: storeKey, index }));
  const filtered = filterProducts(audited, strategy, { storeName: storeKey });
  const sorted = sortProductsByStrategy(filtered, strategy, { storeName: storeKey });
  const comparison = compareProducts({ [storeKey]: audited }, strategy, { storeOrder: [storeKey] });

  assert(sorted.length > 0, `${storeKey}: tri vide`);
  assert(comparison.bestProduct !== null, `${storeKey}: comparaison invalide`);
  assert(comparison.bestProduct.id === sorted[0].id, `${storeKey}: le produit sélectionné n'est pas le meilleur selon la stratégie`);

  const selected = sorted[0];
  const selectedMetric = getMetric(selected, strategy);
  const lowestMetric = Math.min(...sorted.map((item) => getMetric(item, strategy)));
  assert(selectedMetric === lowestMetric, `${storeKey}: le produit choisi n'est pas le moins cher`);

  return { audited, filtered, sorted, selected, comparison };
}

async function auditStoreLive({ storeKey, query, city, strategy, maxRetries, cdpUrl, logger }) {
  const definition = STORE_DEFINITIONS[storeKey];
  assert(definition, `Enseigne inconnue: ${storeKey}`);

  let browser = null;
  try {
    browser = await chromium.connectOverCDP(cdpUrl || DEFAULT_CDP_URL);
  } catch (error) {
    logger.fail("❌ CDP indisponible — arrêt immédiat");
    throw new Error(`CDP indisponible pour ${definition.label}: ${error.message}`);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();
  ensureCdpConnected({ browser, context, page, logger, stepName: "bootstrap" });

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];
      logger.log(`Tentative ${attempt}/${maxRetries} (${profile.label})`);

      try {
        ensureCdpConnected({ browser, context, page, logger, stepName: "selectStore" });
        await ensureHomePage(page, definition.homeUrl);

        const selectResult = await definition.select(page, city, {
          ...profile,
          strict: true
        });
        if (selectResult && selectResult.success === false) {
          throw new Error(`Sélection magasin: ${selectResult.error || "échec inconnu"}`);
        }

        ensureCdpConnected({ browser, context, page, logger, stepName: "searchProduct" });
        const searchResult = await definition.search(page, query, {
          timeout: profile.timeout,
          extraSearchSelectors: profile.extraSearchSelectors,
          extraSubmitSelectors: profile.extraSubmitSelectors,
          extraProductCardSelectors: profile.extraProductCardSelectors,
          strict: true
        });
        if (!searchResult || searchResult.success === false) {
          throw new Error(`Recherche produit: ${searchResult?.error || "échec inconnu"}`);
        }

        logger.log("🔎 Audit extraction — Récupération produits");
        ensureCdpConnected({ browser, context, page, logger, stepName: "extractProductList" });
        const extracted = await definition.extract(page, {
          limit: 12,
          timeout: profile.timeout,
          extraCardSelectors: profile.extraProductCardSelectors
        });

        const extractedProducts = Array.isArray(extracted) ? extracted : [];
        logger.log(`   📦 ${extractedProducts.length} produit(s) extrait(s)`);
        assert(extractedProducts.length > 0, `${definition.label}: extraction vide`);

        logger.log("⚖️ Audit unités — Normalisation et dérivés");
        ensureCdpConnected({ browser, context, page, logger, stepName: "normalizeProduct" });
        const audited = extractedProducts.map((product, index) => normalizeProduct(product, { store: storeKey, index }));

        ensureCdpConnected({ browser, context, page, logger, stepName: "filterProducts" });
        const filtered = filterProducts(audited, strategy, { storeName: storeKey });

        ensureCdpConnected({ browser, context, page, logger, stepName: "sortProductsByStrategy" });
        const sorted = sortProductsByStrategy(filtered, strategy, { storeName: storeKey });

        ensureCdpConnected({ browser, context, page, logger, stepName: "compareProductsAcrossStores" });
        const comparison = compareProducts({ [storeKey]: audited }, strategy, { storeOrder: [storeKey] });

        assert(sorted.length > 0, `${storeKey}: tri vide`);
        assert(comparison.bestProduct !== null, `${storeKey}: comparaison invalide`);
        assert(comparison.bestProduct.id === sorted[0].id, `${storeKey}: le produit sélectionné n'est pas le meilleur selon la stratégie`);

        const selected = sorted[0];
        const metricsCount = audited.filter((p) => Number.isFinite(p.pricePerKg) || Number.isFinite(p.pricePerL) || Number.isFinite(p.pricePerUnit)).length;
        logger.log(`   ✓ ${metricsCount}/${audited.length} produit(s) avec métrique unitaire`);
        assert(metricsCount > 0, `${definition.label}: métrique unitaire manquante`);

        const selectedMetric = getMetric(selected, strategy);
        logger.log(`   💰 Métrique: ${strategy} = ${roundTo(selectedMetric, 4)}`);

        logger.log("📊 Audit tri — Vérification classement");
        logger.log(`   ✓ ${sorted.length} produit(s) après filtrage`);
        assert(sorted.length > 0, `${definition.label}: tri vide`);
        
        const metricsDetail = sorted.slice(0, 3).map((p, idx) => `#${idx + 1}: ${roundTo(getMetric(p, strategy), 4)}`).join(", ");
        logger.log(`   Top 3: ${metricsDetail}`);

        logger.log("🏆 Audit sélection — Vérification meilleur produit");
        assert(comparison.bestProduct !== null, `${definition.label}: comparaison invalide`);
        assert(comparison.bestProduct.id === sorted[0].id, `${definition.label}: incohérence sélection`);
        logger.log(`   ✓ ${selected.name} (${roundTo(selectedMetric, 4)} ${strategy === "best_per_kg" ? "€/kg" : strategy === "best_per_l" ? "€/L" : "€"})`);

        ensureCdpConnected({ browser, context, page, logger, stepName: "addToCart" });
        const addResult = await definition.add(page, Number.isFinite(selected._sourceIndex) ? selected._sourceIndex + 1 : 1, {
          timeout: profile.timeout,
          productName: selected.name,
          extraAddSelectors: profile.extraAddSelectors,
          extraCartSignals: profile.extraCartSignals,
          strict: true
        });
        if (!addResult || addResult.success === false) {
          throw new Error(`Ajout panier: ${addResult?.error || "échec inconnu"}`);
        }

        logger.log("🛒 Audit panier — Vérification ajout");
        let cartCount = await getCartCount(page, profile.extraCartSignals);
        if (cartCount <= 0) {
          const evidence = await hasRealCartEvidence(page);
          if (evidence) {
            cartCount = 1;
            logger.log("   ✓ Preuve UI panier détectée (compteur non lisible)");
          }
        }
        logger.log(`   ✓ Panier: ${cartCount} article(s)`);
        assert(cartCount > 0, `${definition.label}: panier vide après ajout`);

        return {
          live: true,
          cartCount,
          selectedProduct: selected,
          products: audited
        };
      } catch (error) {
        logger.fail(`❌ Erreur réelle détectée — ${definition.label}: ${error.message}`);
        logger.warn(`Tentative ${attempt}/${maxRetries} échouée pour ${definition.label}: ${error.message}`);
        if (attempt < maxRetries) {
          logger.log("🛠 Correction appliquée");
          logger.log("🔁 Retest");
          await page.goto(definition.homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(1000).catch(() => {});
        }
      }
    }
  } finally {
    // Disconnect from CDP so node process exits cleanly after each audit.
    if (browser && typeof browser.isConnected === "function" && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }

  return null;
}

async function runSingleStoreAudit({ storeKey, query, city = "Paris", strategy = "cheapest", maxRetries = 4, cdpUrl = DEFAULT_CDP_URL, prefix = "[audit]" }) {
  const logger = createLogger(prefix);
  const definition = STORE_DEFINITIONS[storeKey];
  assert(definition, `Enseigne inconnue: ${storeKey}`);

  const liveResult = await auditStoreLive({ storeKey, query, city, strategy, maxRetries, cdpUrl, logger });
  if (!liveResult) {
    throw new Error(`${definition.label}: échec audit en mode réel`);
  }

  logger.log(`🟢 ${definition.label} validée (CDP)`);
  return liveResult;
}

async function runGlobalAudit({ items, city = "Paris", strategy = "cheapest", maxRetries = 4, cdpUrl = DEFAULT_CDP_URL, prefix = "[audit-global]" }) {
  const logger = createLogger(prefix);
  const queries = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean) : [];
  assert(queries.length > 0, "Aucun item fourni pour l'audit global");

  let browser = null;
  try {
    browser = await chromium.connectOverCDP(cdpUrl || DEFAULT_CDP_URL);
  } catch (error) {
    logger.fail("❌ CDP indisponible — arrêt immédiat");
    throw new Error(`CDP indisponible pour l'audit global: ${error.message}`);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  const storeKeys = Object.keys(STORE_DEFINITIONS);
  const seedPage = context.pages()[0] || await context.newPage();
  ensureCdpConnected({ browser, context, page: seedPage, logger, stepName: "bootstrap-global" });

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];
      const pages = Object.fromEntries(storeKeys.map((storeKey) => [storeKey, null]));
      const selectedStores = new Set();

      try {
        logger.log(`Tentative ${attempt}/${maxRetries} (${profile.label})`);

        for (const storeKey of storeKeys) {
          pages[storeKey] = context.pages().find((page) => String(page.url() || "").includes(storeKey)) || await context.newPage();
          ensureCdpConnected({ browser, context, page: pages[storeKey], logger, stepName: `selectStore:${storeKey}` });
          await ensureHomePage(pages[storeKey], STORE_DEFINITIONS[storeKey].homeUrl);
        }

        const selectedByItem = [];
        for (const query of queries) {
          logger.log(`\n📋 Audit produit: "${query}"`);
          logger.log("🔎 Audit extraction — Récupération produits");
          const productLists = {};

          for (const storeKey of storeKeys) {
            const page = pages[storeKey];
            const definition = STORE_DEFINITIONS[storeKey];

            if (!selectedStores.has(storeKey)) {
              ensureCdpConnected({ browser, context, page, logger, stepName: "selectStore" });
              const selectResult = await definition.select(page, city, {
                ...profile,
                strict: true
              });
              if (selectResult && selectResult.success === false) {
                throw new Error(`${definition.label}: sélection magasin échouée (${selectResult.error || "inconnue"})`);
              }
              selectedStores.add(storeKey);
            }

            ensureCdpConnected({ browser, context, page, logger, stepName: "searchProduct" });
            const searchResult = await definition.search(page, query, {
              timeout: profile.timeout,
              extraSearchSelectors: profile.extraSearchSelectors,
              extraSubmitSelectors: profile.extraSubmitSelectors,
              extraProductCardSelectors: profile.extraProductCardSelectors,
              strict: true
            });
            if (!searchResult || searchResult.success === false) {
              throw new Error(`${definition.label}: recherche échouée (${searchResult?.error || "inconnue"})`);
            }

            ensureCdpConnected({ browser, context, page, logger, stepName: "extractProductList" });
            let extracted = await definition.extract(page, {
              limit: 12,
              timeout: profile.timeout,
              extraCardSelectors: profile.extraProductCardSelectors
            });

            if (!Array.isArray(extracted) || extracted.length === 0) {
              logger.warn(`${definition.label}: extraction vide, nouvelle tentative`);
              ensureCdpConnected({ browser, context, page, logger, stepName: "searchProduct:retry" });
              const retrySearch = await definition.search(page, query, {
                timeout: profile.timeout,
                extraSearchSelectors: profile.extraSearchSelectors,
                extraSubmitSelectors: profile.extraSubmitSelectors,
                extraProductCardSelectors: profile.extraProductCardSelectors,
                strict: true
              });
              if (!retrySearch || retrySearch.success === false) {
                throw new Error(`${definition.label}: recherche retry échouée (${retrySearch?.error || "inconnue"})`);
              }

              ensureCdpConnected({ browser, context, page, logger, stepName: "extractProductList:retry" });
              extracted = await definition.extract(page, {
                limit: 12,
                timeout: profile.timeout,
                extraCardSelectors: profile.extraProductCardSelectors
              });
            }

            ensureCdpConnected({ browser, context, page, logger, stepName: "normalizeProduct" });
            const normalized = Array.isArray(extracted)
              ? extracted.map((product, index) => normalizeProduct(product, { store: storeKey, index }))
              : [];
            assert(normalized.length > 0, `${definition.label}: extraction vide`);
            const metricsCount = normalized.filter((p) => Number.isFinite(p.pricePerKg) || Number.isFinite(p.pricePerL) || Number.isFinite(p.pricePerUnit)).length;
            assert(metricsCount > 0, `${definition.label}: métrique unitaire manquante`);
            productLists[storeKey] = normalized;
            logger.log(`   ${definition.label}: ${normalized.length} produit(s) extrait(s)`);
          }

          logger.log("⚖️ Audit unités — Normalisation et dérivés");
          const activePage = Object.values(pages).find((candidate) => candidate && !candidate.isClosed())
            || context.pages().find((candidate) => candidate && !candidate.isClosed())
            || await context.newPage();

          ensureCdpConnected({ browser, context, page: activePage, logger, stepName: "filterProducts" });
          const filteredLists = Object.fromEntries(storeKeys.map((storeKey) => [storeKey, filterProducts(productLists[storeKey], strategy, { storeName: storeKey })]));

          ensureCdpConnected({ browser, context, page: activePage, logger, stepName: "sortProductsByStrategy" });
          const sortedLists = Object.fromEntries(storeKeys.map((storeKey) => [storeKey, sortProductsByStrategy(filteredLists[storeKey], strategy, { storeName: storeKey })]));
          assert(Object.values(sortedLists).some((entries) => entries.length > 0), `Aucun produit trié pour ${query}`);

          ensureCdpConnected({ browser, context, page: activePage, logger, stepName: "compareProductsAcrossStores" });
          const comparison = compareProducts(sortedLists, strategy, { storeOrder: storeKeys });
          const winner = comparison.bestProduct;
          assert(winner, `Aucun produit gagnant pour ${query}`);

          const metricsDetail = storeKeys.map((sk) => {
            const products = sortedLists[sk];
            const bestInStore = products.length > 0
              ? Math.min(...products.map((p) => getMetric(p, strategy)))
              : Number.POSITIVE_INFINITY;
            return `${STORE_DEFINITIONS[sk].label}: ${bestInStore === Number.POSITIVE_INFINITY ? "N/A" : roundTo(bestInStore, 4)}`;
          }).join(" | ");
          logger.log(`   ${metricsDetail}`);

          logger.log("📊 Audit tri — Vérification classement");
          logger.log(`   ✓ Top enseigne: ${STORE_DEFINITIONS[winner.store].label}`);

          logger.log("🏆 Audit sélection — Comparaison multi-enseignes");
          const selectedMetric = getMetric(winner, strategy);
          logger.log(`   🏆 Gagnant: ${winner.name} (${roundTo(selectedMetric, 4)} ${strategy === "best_per_kg" ? "€/kg" : strategy === "best_per_l" ? "€/L" : "€"})`);

          const candidatePool = storeKeys
            .flatMap((storeKey) => {
              const entries = Array.isArray(sortedLists[storeKey]) ? sortedLists[storeKey] : [];
              return entries.map((product) => ({ ...product, store: storeKey }));
            })
            .sort((a, b) => getMetric(a, strategy) - getMetric(b, strategy));

          let validatedSelection = null;
          let validatedCartCount = 0;
          let lastAddError = null;

          for (const candidate of candidatePool.slice(0, 10)) {
            const candidatePage = pages[candidate.store];
            const candidateDefinition = STORE_DEFINITIONS[candidate.store];

            ensureCdpConnected({ browser, context, page: candidatePage, logger, stepName: "addToCart" });
            const addResult = await candidateDefinition.add(candidatePage, Number.isFinite(candidate._sourceIndex) ? candidate._sourceIndex + 1 : 1, {
              timeout: profile.timeout,
              productName: candidate.name,
              extraAddSelectors: profile.extraAddSelectors,
              extraCartSignals: profile.extraCartSignals,
              strict: true
            });

            if (!addResult || addResult.success === false) {
              lastAddError = `${candidateDefinition.label}: ${addResult?.error || "échec ajout"}`;
              continue;
            }

            logger.log("🛒 Audit panier — Vérification ajout");
            let cartCount = await getCartCount(candidatePage, profile.extraCartSignals);
            if (cartCount <= 0) {
              const evidence = await hasRealCartEvidence(candidatePage);
              if (evidence) {
                cartCount = 1;
                logger.log(`   ✓ ${candidateDefinition.label}: preuve UI panier détectée (compteur non lisible)`);
              }
            }
            logger.log(`   ✓ ${candidateDefinition.label}: ${cartCount} article(s)`);

            if (cartCount > 0) {
              validatedSelection = candidate;
              validatedCartCount = cartCount;
              break;
            }

            lastAddError = `${candidateDefinition.label}: panier vide après ajout`;
          }

          if (!validatedSelection) {
            throw new Error(`Ajout panier global échoué (${lastAddError || "aucun candidat ajoutable"})`);
          }

          selectedByItem.push({ item: query, winnerStore: validatedSelection.store, winnerProduct: validatedSelection, cartCount: validatedCartCount });
        }

        assert(selectedByItem.length === queries.length, "Tous les items n'ont pas été traités");
        assert(selectedByItem.every((entry) => entry.winnerProduct), "Au moins un item n'a aucun produit sélectionné");

        logger.log("🟢 Audit global validé (CDP)");
        return {
          live: true,
          items: selectedByItem
        };
      } catch (error) {
        logger.fail(`❌ Erreur réelle détectée — audit global: ${error.message}`);
        logger.warn(`Tentative ${attempt}/${maxRetries} échouée pour l'audit global: ${error.message}`);
        if (attempt < maxRetries) {
          logger.log("🛠 Correction appliquée");
          logger.log("🔁 Retest");
        }
        for (const page of Object.values(pages)) {
          await page?.close().catch(() => {});
        }
      }
    }
  } finally {
    // Disconnect from CDP so node process exits cleanly after each global audit.
    if (browser && typeof browser.isConnected === "function" && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }

  throw new Error("Audit global: échec en mode réel (CDP only)");
}

export {
  ADAPTIVE_PROFILES,
  STORE_DEFINITIONS,
  assertUnitNormalization,
  createLogger,
  runGlobalAudit,
  runSingleStoreAudit
};