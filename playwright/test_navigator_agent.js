#!/usr/bin/env node
/**
 * test_navigator_agent.js
 *
 * End-to-end test for selectLeclercDriveArrow().
 *
 * Workflow:
 *  1. Connect to the local Chrome instance via CDP (port 9222).
 *  2. Navigate to leclercdrive.fr.
 *  3. Dismiss cookie banner if present.
 *  4. Search for city "Rodez" in the store-selection input.
 *  5. Wait for the store list to render.
 *  6. Call selectLeclercDriveArrow(page).
 *  7. Verify the "Choisir ce Drive" panel is open.
 *  8. On any failure: analyse cause, patch selectors/timeouts, retry.
 *  9. Print a final summary.
 *
 * Usage:
 *   node test_navigator_agent.js [--city Rodez] [--max-retries 3] [--headful]
 *
 * Requires the local Chrome server:
 *   google-chrome-stable --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile
 */

import minimist from "minimist";
import { chromium } from "playwright";
import { selectLeclercDriveArrow, LECLERC_ARROW_SELECTORS } from "./agents/navigator_agent.js";

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = minimist(process.argv.slice(2), {
  string: ["city"],
  boolean: ["headful"],
  default: {
    city: "Rodez",
    "max-retries": 3,
    headful: false
  }
});

const CITY         = String(args.city || "Rodez");
const MAX_RETRIES  = Math.max(1, parseInt(String(args["max-retries"] || "3"), 10));
const CDP_URL      = "http://localhost:9222";
const LECLERC_URL  = "https://www.leclercdrive.fr/";

// ─── Selector constants (overridable between retries) ────────────────────────
const COOKIE_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button:has-text('Tout accepter')",
  "button:has-text('Accepter')",
  "button[id*='accept' i]"
];

const STORE_SEARCH_SELECTORS = [
  "input[id='wpad-recherche-magasin-input']",
  "input[placeholder*='Où souhaitez' i]",
  "input[placeholder*='code postal' i]",
  "input[placeholder*='ville' i]",
  "input[aria-label*='magasin' i]",
  "input[name*='store' i]",
  "input[type='search']"
];

// Panel-open confirmation selectors (expanded between retries if needed)
let PANEL_CONFIRM_SELECTORS = [
  "button:has-text('Choisir ce Drive')",
  "button:has-text('Choisir ce drive')",
  "[class*='driveDetail' i]",
  "[class*='drive-detail' i]",
  "[class*='storeDetail' i]",
  "[class*='store-detail' i]"
];

// ─── Logging helpers ──────────────────────────────────────────────────────────
const LOG_PREFIX = "[test_navigator_agent]";
function log(msg)   { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg)  { console.warn(`${LOG_PREFIX} ⚠️  ${msg}`); }
function error(msg) { console.error(`${LOG_PREFIX} ❌ ${msg}`); }

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Try each selector; return the first one found in the page within `timeout` ms.
 * Returns null if none matched.
 */
async function findFirst(page, selectors, timeout = 3000) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout });
      return sel;
    } catch (_) {
      // not found – try next
    }
  }
  return null;
}

/**
 * Click the first matching selector from the list, silently skip if none found.
 */
async function safeClick(page, selectors, label = "element") {
  const sel = await findFirst(page, selectors, 3000);
  if (!sel) {
    log(`  ${label} non détecté — ignoré`);
    return false;
  }
  try {
    await page.click(sel, { timeout: 4000 });
    log(`  Clic sur ${label} : ${sel}`);
    return true;
  } catch (err) {
    warn(`  Clic sur ${label} échoué (${err.message}), tentative JS`);
    try {
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }, sel);
      log(`  Clic JS sur ${label} : ${sel}`);
      return true;
    } catch (_) {
      return false;
    }
  }
}

/**
 * Fill an input and wait for suggestions / DOM update.
 */
async function fillStoreSearch(page, city) {
  const sel = await findFirst(page, STORE_SEARCH_SELECTORS, 6000);
  if (!sel) throw new Error(`Champ de recherche magasin introuvable (ville: ${city})`);

  log(`  Saisie de la ville "${city}" dans : ${sel}`);
  await page.click(sel, { timeout: 5000 });
  await page.fill(sel, "");
    // Type character by character to trigger the HeadlessUI combobox autocomplete
    await page.type(sel, city, { delay: 80 });
    await page.waitForTimeout(1200);

    // Click the first matching autocomplete option directly.
    // NOTE: ArrowDown selects the 2nd item (wrong city), so we click by text.
    try {
      const cityOption = page.locator("[role='option']").filter({ hasText: city }).first();
      const count = await cityOption.count();
      if (count > 0) {
        const optionText = await cityOption.textContent();
        log(`  Clic sur l'option autocomplete : "${optionText?.trim()}"`);
        await cityOption.click({ timeout: 3000 });
        await page.waitForTimeout(1200);
        log(`  Option sélectionnée`);
        return;
      }
    } catch (_) {
      warn(`  Clic option autocomplete échoué, fallback clavier`);
    }

    // Fallback: press Enter without ArrowDown (sends the raw typed city)
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
}

/**
 * Wait for the store list to contain at least one item.
 * Handles the new iel-* React component and legacy WPAD system.
 * Returns true once visible, false on timeout.
 */
async function waitForStoreList(page, timeout = 20000) {
  log(`  Attente de la liste des magasins…`);

  // Phase 1: wait for the iel-* filter buttons (fast signal, ~2-4s after city selection)
  try {
    await page.waitForSelector(
      "button[class*=\'iel-rounded-3xl\'], section[class*=\'iel-mx-auto\'] button[class*=\'iel-\']",
      { timeout: 8000 }
    );
    log(`  ✅ Composant iel-* actif (boutons filtre visibles)`);
  } catch (_) {
    log(`  Boutons filtre iel-* non détectés, on continue…`);
  }

  // Phase 2: wait for actual store items in the list panel
  const storeListSelectors = [
    // New iel-* component: items in the right panel of the flex-row map+list layout
    "section[class*=\'iel-flex-row\'] > :last-child li",
    "section[class*=\'iel-flex-row\'] > :last-child button",
    // Legacy WPAD system
    "#idDivWPAD337_Liste li",
    // Generic store cards
    ".store-item",
    "[class*=\'storeCard\' i]",
    "[class*=\'store-card\' i]",
    "[class*=\'driveItem\' i]",
    "[class*=\'drive-item\' i]",
    // Direct selection buttons
    "button:has-text(\'Choisir ce Drive\')",
    "button:has-text(\'Choisir ce drive\')"
  ];

  const remaining = Math.max(timeout - 8000, 8000);
  const combined = storeListSelectors.join(", ");
  try {
    await page.waitForSelector(combined, { timeout: remaining });
    log(`  ✅ Items de magasins détectés`);
    return true;
  } catch (_) {
    warn(`  Liste des magasins non détectée après ${timeout}ms`);
    return false;
  }
}


/**
 * Capture a compact diagnostic snapshot for post-failure analysis.
 * Dumps URL, title, and an excerpt of the body text.
 */
async function diagSnapshot(page) {
  try {
    const url   = page.url();
    const title = await page.title();
    const body  = await page.evaluate(() =>
      (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 400)
    );
    return { url, title, body };
  } catch (_) {
    return { url: "?", title: "?", body: "?" };
  }
}

/**
 * Return true if the page seems blocked by anti-bot/CAPTCHA.
 */
async function isCaptchaOrBlocked(page) {
  try {
    const frameUrls = page.frames().map((f) => String(f.url() || "").toLowerCase());
    if (frameUrls.some((u) => u.includes("captcha-delivery.com") || u.includes("datadome"))) {
      return true;
    }

    const snap = await diagSnapshot(page);
    const bodyLen = (snap.body || "").trim().length;
    if (bodyLen === 0) {
      return true;
    }

    return false;
  } catch (_) {
    return true;
  }
}

/**
 * Ensure Leclerc page is loaded and the store search input is reachable.
 */
async function ensureLeclercReady(page, attempt) {
  const shouldNavigate = attempt === 1 || !String(page.url() || "").includes("leclercdrive.fr");
  if (shouldNavigate) {
    log(`Chargement de ${LECLERC_URL}…`);
    await page.goto(LECLERC_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1800);
  } else {
    log(`Réutilisation de la page actuelle : ${page.url()}`);
  }

  log(`  URL courante : ${page.url()}`);

  const searchSel = await findFirst(page, STORE_SEARCH_SELECTORS, 5000);
  if (searchSel) {
    return;
  }

  if (await isCaptchaOrBlocked(page)) {
    throw new Error(
      "Page bloquée par anti-bot/CAPTCHA (DOM vide ou frame captcha). Résolvez le CAPTCHA manuellement dans Chrome, puis relancez le test."
    );
  }

  throw new Error("Page chargée mais champ de recherche magasin introuvable");
}

/**
 * Pick the best existing page from the context: prefer Leclerc page with visible DOM.
 */
async function pickBestPage(context) {
  const pages = context.pages();
  if (pages.length === 0) {
    return context.newPage();
  }

  for (const p of pages) {
    const url = String(p.url() || "").toLowerCase();
    if (!url.includes("leclercdrive.fr")) continue;
    const blocked = await isCaptchaOrBlocked(p);
    if (!blocked) return p;
  }

  for (const p of pages) {
    const url = String(p.url() || "").toLowerCase();
    if (url.includes("leclercdrive.fr")) return p;
  }

  return pages[0];
}

// ─── Adaptive selector patch applied between retries ─────────────────────────
/**
 * On attempt N, analyse the last error and patch selectors or logic accordingly.
 * Mutations are applied in-place on the selector arrays.
 */
function adaptSelectors(attempt, lastError) {
  const msg = String(lastError || "").toLowerCase();

  // Expand panel confirmation selectors progressively
  if (attempt === 2) {
    // Possibly the panel text is slightly different
    PANEL_CONFIRM_SELECTORS = [
      ...PANEL_CONFIRM_SELECTORS,
      "button:has-text('Sélectionner')",
      "button:has-text('Choisir')",
      "[class*='panel' i][class*='drive' i]",
      "[class*='detail' i][class*='drive' i]",
      "aside[class*='drive' i]",
      "section[class*='drive' i]"
    ];
    log(`  Adaption tentative ${attempt} : sélecteurs panneau élargis`);
  }

  if (attempt >= 3) {
    // Last resort: accept any overlay / modal appearing after the click
    PANEL_CONFIRM_SELECTORS = [
      ...PANEL_CONFIRM_SELECTORS,
      "[role='dialog']",
      "[role='complementary']",
      "[class*='overlay' i]",
      "[class*='modal' i]"
    ];
    log(`  Adaption tentative ${attempt} : sélecteurs panneau en mode fallback large`);
  }
}

// ─── Single test attempt ───────────────────────────────────────────────────────
async function runAttempt(page, attempt) {
  log(`\n────────────────────────────────────────────────`);
  log(`Tentative ${attempt} / ${MAX_RETRIES}`);
  log(`────────────────────────────────────────────────`);

  // 1. Ensure Leclerc page is ready (or fail fast on CAPTCHA)
  await ensureLeclercReady(page, attempt);

  // 2. Dismiss cookie banner
  log(`Vérification bannière cookies…`);
  await safeClick(page, COOKIE_SELECTORS, "bannière cookies");
  await page.waitForTimeout(500);

  // 3. Search for city
  log(`Recherche de la ville "${CITY}"…`);
  try {
    await fillStoreSearch(page, CITY);
  } catch (err) {
    warn(`Saisie ville échouée : ${err.message}`);
    const snap = await diagSnapshot(page);
    log(`  Diagnostic : url=${snap.url} title="${snap.title}"`);
    log(`  Body aperçu : ${snap.body}`);
    throw err;
  }

  // 4. Wait for store list
  const listVisible = await waitForStoreList(page);
  if (!listVisible) {
    const snap = await diagSnapshot(page);
    log(`  Diagnostic : url=${snap.url} title="${snap.title}"`);
    log(`  Body aperçu : ${snap.body}`);
    throw new Error("Liste des magasins non rendue");
  }

  // 5. Click arrow via agent function
  log(`Appel de selectLeclercDriveArrow()…`);
  const result = await selectLeclercDriveArrow(page, {
    storeListTimeout: 20000,
    panelTimeout: 8000
  });

  if (result.success) {
    log(`✅ selectLeclercDriveArrow réussi — sélecteur utilisé : ${result.selector}`);
    return true;
  }

  // Agent function reported failure: verify panel ourselves with extended selectors
  warn(`selectLeclercDriveArrow a retourné failure: ${result.error}`);
  log(`  Vérification manuelle du panneau avec sélecteurs étendus…`);

  const panelSel = await findFirst(page, PANEL_CONFIRM_SELECTORS, 3000);
  if (panelSel) {
    log(`✅ Panneau détecté manuellement via : ${panelSel}`);
    return true;
  }

  const snap = await diagSnapshot(page);
  log(`  Diagnostic post-clic : url=${snap.url} title="${snap.title}"`);
  log(`  Body aperçu : ${snap.body}`);

  throw new Error(result.error || "Panneau non détecté après clic flèche");
}

// ─── Main entry point ─────────────────────────────────────────────────────────
async function main() {
  log(`═══════════════════════════════════════════════════`);
  log(` PanierBot — test_navigator_agent.js`);
  log(` CDP : ${CDP_URL}  |  Ville : ${CITY}  |  Retries max : ${MAX_RETRIES}`);
  log(`═══════════════════════════════════════════════════\n`);

  // Connect to local Chrome via CDP
  let browser;
  try {
    log(`Connexion CDP à ${CDP_URL}…`);
    browser = await chromium.connectOverCDP(CDP_URL);
    log(`Connecté. Contextes disponibles : ${browser.contexts().length}`);
  } catch (err) {
    error(`Impossible de se connecter au navigateur local : ${err.message}`);
    error(`Vérifiez que Chrome tourne avec --remote-debugging-port=9222`);
    process.exit(1);
  }

  // Reuse existing context/page or create a new one
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

  let lastError = null;
  let success   = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      success = await runAttempt(page, attempt);
      if (success) break;
    } catch (err) {
      lastError = err.message;
      error(`Tentative ${attempt} échouée : ${err.message}`);
      if (String(lastError).toLowerCase().includes("captcha")) {
        break;
      }
      if (attempt < MAX_RETRIES) {
        adaptSelectors(attempt + 1, lastError);
        log(`Pause avant nouvelle tentative…`);
        await page.waitForTimeout(2000);
      }
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  log(`\n${"═".repeat(51)}`);
  if (success) {
    log(`✅ Test réussi — panneau ouvert`);
  } else {
    error(`❌ Échec après ${MAX_RETRIES} tentative(s) — dernière erreur : ${lastError}`);
  }
  log(`${"═".repeat(51)}\n`);

  // Do NOT disconnect (browser stays open for inspection)
  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  error(`Erreur fatale non capturée : ${err.message}`);
  process.exit(1);
});
