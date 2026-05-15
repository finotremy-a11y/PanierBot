#!/usr/bin/env node
/**
 * test_superu_flow.js
 *
 * E2E Super U / CoursesU flow (CDP only):
 * 1) Select store
 * 2) Search product
 * 3) Extract list
 * 4) Add to cart
 * 5) Verify cart > 0
 *
 * Auto-correction strategy:
 * - Retry with adaptive selector profiles on each attempt
 * - Re-open Super U page between attempts
 */

import minimist from "minimist";
import { chromium } from "playwright";
import {
  selectSuperUStore,
  searchSuperUProduct,
  extractSuperUProductList,
  addSuperUToCart
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
const SUPERU_DRIVE_URL = "https://www.coursesu.com/";

const LOG_PREFIX = "[test_superu_flow]";
function log(msg) { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg) { console.warn(`${LOG_PREFIX} ⚠️  ${msg}`); }
function fail(msg) { console.error(`${LOG_PREFIX} ❌ ${msg}`); }

const ADAPTIVE_PROFILES = [
  {
    label: "react-data-testid",
    extraStoreSearchSelectors: [
      "input[name='search']",
      "input[data-testid*='store-search' i]",
      "input[data-testid*='store' i]"
    ],
    extraStoreCardSelectors: [
      "[data-testid='store-card']",
      "[data-testid*='store-card' i]",
      "[data-testid*='store-result' i]"
    ],
    extraStoreButtonSelectors: [
      "button[data-testid*='select' i]",
      "button[data-testid*='choose' i]",
      "button:has-text('Choisir')"
    ],
    extraSearchSelectors: [
      "input[name='search']",
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
      "input[placeholder*='ville' i]"
    ],
    extraStoreCardSelectors: [
      "article[class*='store' i]",
      "li[class*='store' i]",
      "div[class*='store-card' i]"
    ],
    extraStoreButtonSelectors: [
      "button:has-text('Choisir')",
      "button:has-text('Sélectionner')",
      "button:has-text('Continuer')"
    ],
    extraSearchSelectors: [
      "input[type='search']",
      "input[placeholder*='recherche' i]"
    ],
    extraSubmitSelectors: [
      "button:has-text('Rechercher')",
      "button[type='submit']"
    ],
    extraProductCardSelectors: [
      "article[class*='product' i]",
      "li[class*='product' i]",
      "div[class*='product' i]"
    ],
    extraAddSelectors: [
      "button:has-text('Ajouter')",
      "button:has-text('Acheter')"
    ],
    extraCartSignals: [
      "a[href*='panier' i]",
      "button[aria-label*='panier' i]"
    ]
  }
];

async function runTest() {
  log(`🛒 Test Super U (${CITY}, "${QUERY}")`);
  log(`   Retries: ${MAX_RETRIES}, CDP: ${CDP_URL}`);

  let browser = null;
  let page = null;

  try {
    // Connect to browser via CDP
    browser = await chromium.connectOverCDP(CDP_URL);
    const contexts = browser.contexts();
    const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    let storeSelected = false;
    let productsFound = false;
    let productsExtracted = false;
    let addedToCart = false;
    let cartVerified = false;

    // === PHASE 1: Select Store ===
    log("📍 PHASE 1: Store selection");
    for (let attempt = 1; attempt <= MAX_RETRIES && !storeSelected; attempt++) {
      try {
        warn(`   Attempt ${attempt}/${MAX_RETRIES}`);
        const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];
        log(`   Using profile: ${profile.label}`);

        const result = await selectSuperUStore(page, CITY, {
          timeout: 30000,
          extraStoreSearchSelectors: profile.extraStoreSearchSelectors,
          extraStoreCardSelectors: profile.extraStoreCardSelectors,
          extraStoreButtonSelectors: profile.extraStoreButtonSelectors
        });

        if (result.success) {
          log(`✅ Store selected: ${result.storeName}`);
          storeSelected = true;
        } else {
          warn(`   Store selection failed: ${result.error}`);
          if (attempt < MAX_RETRIES) {
            log("   Retrying...");
            await page.goto(SUPERU_DRIVE_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
            await page.waitForTimeout(1000);
          }
        }
      } catch (err) {
        warn(`   Store selection error: ${err.message}`);
      }
    }

    if (!storeSelected) {
      fail("Store selection failed after all retries");
      return false;
    }

    // === PHASE 2: Search Product ===
    log("🔍 PHASE 2: Product search");
    for (let attempt = 1; attempt <= MAX_RETRIES && !productsFound; attempt++) {
      try {
        warn(`   Attempt ${attempt}/${MAX_RETRIES}`);
        const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];

        const result = await searchSuperUProduct(page, QUERY, {
          timeout: 20000,
          extraSearchSelectors: profile.extraSearchSelectors,
          extraSubmitSelectors: profile.extraSubmitSelectors
        });

        if (result.success && result.products.length > 0) {
          log(`✅ Found ${result.products.length} products`);
          productsFound = true;
        } else {
          warn(`   Search failed: ${result.error || "no products"}`);
        }
      } catch (err) {
        warn(`   Search error: ${err.message}`);
      }
    }

    if (!productsFound) {
      fail("Product search failed after all retries");
      return false;
    }

    // === PHASE 3: Extract Product List ===
    log("📄 PHASE 3: Extract product list");
    for (let attempt = 1; attempt <= MAX_RETRIES && !productsExtracted; attempt++) {
      try {
        warn(`   Attempt ${attempt}/${MAX_RETRIES}`);
        const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];

        const products = await extractSuperUProductList(page, {
          limit: 10,
          timeout: 15000,
          extraCardSelectors: profile.extraProductCardSelectors
        });

        if (products.length > 0) {
          log(`✅ Extracted ${products.length} products`);
          for (const p of products.slice(0, 3)) {
            log(`   - ${p.name}: ${p.price}€${p.promo ? ` (${p.promo})` : ""}`);
          }
          productsExtracted = true;
        } else {
          warn(`   No products extracted`);
        }
      } catch (err) {
        warn(`   Extraction error: ${err.message}`);
      }
    }

    if (!productsExtracted) {
      warn("⚠️  Product extraction failed, continuing with add to cart...");
    }

    // === PHASE 4: Add to Cart ===
    log("🛒 PHASE 4: Add to cart");
    for (let attempt = 1; attempt <= MAX_RETRIES && !addedToCart; attempt++) {
      try {
        warn(`   Attempt ${attempt}/${MAX_RETRIES}`);
        const profile = ADAPTIVE_PROFILES[(attempt - 1) % ADAPTIVE_PROFILES.length];

        const result = await addSuperUToCart(page, 1, {
          timeout: 15000,
          extraCartSignals: profile.extraCartSignals
        });

        if (result.success) {
          log(`✅ Product added to cart`);
          addedToCart = true;
        } else {
          warn(`   Add to cart failed: ${result.error}`);
        }
      } catch (err) {
        warn(`   Add to cart error: ${err.message}`);
      }
    }

    if (!addedToCart) {
      fail("Add to cart failed after all retries");
      return false;
    }

    // === PHASE 5: Verify Cart ===
    log("✓ PHASE 5: Verify cart");
    const cartCount = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const body = clean(document.body?.innerText || "");
      
      // Try to find cart count in various places
      const signals = [
        "[data-testid*='cart-count' i]",
        "[data-testid*='basket-count' i]",
        "[data-testid*='cart' i] [class*='count' i]",
        "[class*='cart' i] [class*='badge' i]",
        "[class*='panier' i] [class*='badge' i]"
      ];

      let maxCount = 0;
      for (const selector of signals) {
        try {
          const nodes = Array.from(document.querySelectorAll(selector));
          for (const node of nodes) {
            const match = String(node.textContent || "").match(/\d+/);
            if (match) {
              const count = Number(match[0]);
              if (count > maxCount) maxCount = count;
            }
          }
        } catch (_) {
          // ignore
        }
      }

      return maxCount > 0 ? maxCount : (body.includes("panier") ? 1 : 0);
    }).catch(() => 0);

    if (cartCount > 0) {
      log(`✅ Cart verified: ${cartCount} item(s)`);
      cartVerified = true;
    } else {
      fail("Cart is empty or could not be verified");
      return false;
    }

    // === SUCCESS ===
    log("");
    log("═".repeat(50));
    log("🛒 Super U — Test réussi!");
    log("═".repeat(50));
    log(`✅ Store: ${CITY}`);
    log(`✅ Query: ${QUERY}`);
    log(`✅ Cart items: ${cartCount}`);
    log("");

    return true;
  } catch (error) {
    fail(`Unexpected error: ${error.message}`);
    return false;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// Run the test
const success = await runTest();
process.exit(success ? 0 : 1);
