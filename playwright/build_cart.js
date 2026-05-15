#!/usr/bin/env node

/**
 * PanierBot Playwright Orchestrator
 *
 * Main autonomous loop:
 * - Detect popups
 * - Search product
 * - Analyze page
 * - Extract and compare products
 * - Select best product
 * - Add to cart
 * - Continue until all items are processed
 */

import minimist from "minimist";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { decideNextAction, SELECTORS_BY_STORE } from "./agents/navigator_agent.js";

// URLs des drives (pages d'accueil des services courses en ligne, pas les sites institutionnels).
const STORES = {
  leclerc:     "https://www.leclercdrive.fr/",
  carrefour:   "https://courses.carrefour.fr/",
  intermarche: "https://drive.intermarche.com/"
};

const DEFAULT_TIMEOUT = 12000;
const AGENT_LOOP_MAX_ITERATIONS = 200;
const ACTION_TIMEOUT = 8000;
const POST_ACTION_WAIT_MS = 800;
const WAIT_MIN_MS = 200;
const WAIT_MAX_MS = 5000;
const ACTION_MAX_RETRIES = 2;
const SUPPORTED_STRATEGIES = new Set(["cheapest", "best_per_kg"]);
const AUTH_STATE_PATH = "auth.json";
const DEBUG_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36";

let actionRuntime = null;

function parseArgs(argv) {
  const parsed = minimist(argv.slice(2), {
    string: ["store", "items", "strategy"],
    default: {
      strategy: "cheapest"
    }
  });

  return {
    store: parsed.store || null,
    items: parsed.items || null,
    strategy: normalizeStrategy(parsed.strategy)
  };
}

function normalizeStrategy(strategy) {
  const safe = String(strategy || "").trim().toLowerCase();
  return SUPPORTED_STRATEGIES.has(safe) ? safe : "cheapest";
}

/**
 * Execute a single action returned by the navigator agent.
 * Returns true if the action was handled successfully.
 */
async function executeAction(page, action) {
  if (!actionRuntime) {
    throw new Error("executeAction called without runtime context");
  }

  const { remainingItems, debugLogs } = actionRuntime;
  const actionType = String(action?.action || action?.type || "").trim();
  const selector = action?.selector || null;
  const value = action?.value || null;
  const reason = action?.reason || "";
  const storeQuery = String(action?.storeQuery || value || "Paris");

  debugLogs.push(`executeAction:start type=${actionType} selector=${selector || "none"} reason=${reason}`);
  console.log(`[DEBUG] Action ${actionType} selector=${selector || "none"} reason=${reason}`);

  try {
    switch (actionType) {
      case "search": {
        const robustSearchSelectors = [
          "input[placeholder*='Rechercher']",
          "input[type='search']",
          "input[id*='search']",
          "input[class*='search']",
          "input[aria-label='Rechercher']"
        ];
        const searchCandidates = normalizeSelectorList(
          selector ? [selector] : [],
          robustSearchSelectors
        );
        const resolvedSearchSelector = await findFirstAvailableSelector(page, searchCandidates);

        if (!resolvedSearchSelector) {
          const jsOnlyFallbackOk = await fillVisibleInputWithJsFallback(page, robustSearchSelectors, String(value || ""));
          if (!jsOnlyFallbackOk) {
            debugLogs.push(`action:error search input not found for selectors=${searchCandidates.join(" | ")}`);
            console.error(`[DEBUG] search input not found for selectors: ${searchCandidates.join(" | ")}`);
            return false;
          }

          debugLogs.push(`action:search completed with js fallback for "${value}"`);
          await page.waitForTimeout(POST_ACTION_WAIT_MS);
          return true;
        }

        const input = page.locator(resolvedSearchSelector).first();

        await withActionRetries(page, "search", async () => {
          try {
            await input.click({ timeout: ACTION_TIMEOUT });
            await input.fill("");
            await input.fill(String(value || ""));
            await page.keyboard.press("Enter");
          } catch (error) {
            const fallbackOk = await fillVisibleInputWithJsFallback(page, searchCandidates, String(value || ""));
            if (!fallbackOk) {
              throw error;
            }
            debugLogs.push(`action:search js fallback used selector=${resolvedSearchSelector}`);
          }
          await page.waitForTimeout(POST_ACTION_WAIT_MS);
        }, debugLogs);

        debugLogs.push(`action:search completed for "${value}" selector=${resolvedSearchSelector}`);
        return true;
      }

      case "click": {
        if (!selector) {
          debugLogs.push("action:error click without selector");
          console.error("[DEBUG] click action failed: selector missing");
          return false;
        }

        if (!(await isVisible(page, selector))) {
          console.log("Élément invisible, clic ignoré :", selector);
          debugLogs.push(`action:click skipped invisible selector=${selector}`);
          return true;
        }

        const element = page.locator(selector).first();
        if ((await element.count()) === 0) {
          debugLogs.push(`action:error click target not found for selector=${selector}`);
          console.error(`[DEBUG] click target not found: ${selector}`);
          return false;
        }

        try {
          await withActionRetries(page, "click", async () => {
            await element.click({ timeout: ACTION_TIMEOUT });
            await page.waitForTimeout(POST_ACTION_WAIT_MS);
          }, debugLogs);
        } catch (error) {
          const message = (error && error.message) ? error.message.toLowerCase() : String(error).toLowerCase();
          if (message.includes("not visible")) {
            console.log("ForceClick JS utilisé pour un élément invisible :", selector);
            debugLogs.push(`action:click_js_fallback selector=${selector}`);
            await page.evaluate((targetSelector) => {
              const el = document.querySelector(targetSelector);
              if (el) {
                el.click();
              }
            }, selector);
            await page.waitForTimeout(500);
          } else {
            throw error;
          }
        }

        debugLogs.push(`action:click completed`);
        return true;
      }

      case "add_to_cart": {
        if (!selector) {
          debugLogs.push("action:error add_to_cart without selector");
          console.error("[DEBUG] add_to_cart action failed: selector missing");
          return false;
        }

        const button = page.locator(selector).first();
        if ((await button.count()) === 0) {
          debugLogs.push(`action:error add_to_cart button not found for selector=${selector}`);
          console.error(`[DEBUG] add_to_cart target not found: ${selector}`);
          return false;
        }

        await withActionRetries(page, "add_to_cart", async () => {
          await button.click({ timeout: ACTION_TIMEOUT });
          await page.waitForTimeout(POST_ACTION_WAIT_MS);
        }, debugLogs);

        const currentItem = remainingItems.shift();
        debugLogs.push(`action:add_to_cart completed, item removed: "${currentItem}"`);
        return true;
      }

      case "select_store": {
        actionRuntime.selectStoreAttempts = (actionRuntime.selectStoreAttempts || 0) + 1;
        if (actionRuntime.selectStoreAttempts > 4) {
          debugLogs.push(`action:error select_store max attempts reached (${actionRuntime.selectStoreAttempts})`);
          console.error("[DEBUG] select_store aborted: too many consecutive attempts");
          return false;
        }

        console.log("Page de choix du magasin détectée");
        console.log("Sélection du magasin…");

        const annuaireResult = await page.evaluate((query) => {
          const normalize = (txt) => String(txt || "").toLowerCase().replace(/\s+/g, " ").trim();
          const dispatchMouseSequence = (el) => {
            if (!el) return;
            const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
            for (const eventName of events) {
              el.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
            }
            if (typeof el.click === "function") {
              el.click();
            }
          };

          const popin = document.querySelector("#ctl00_WctlWCTD224_PopinManager1, .divWCTD224_PopinManager, [class*='PopinManager']");
          const annuaire = document.querySelector(".Annuaire__service--liste, .Annuaire__service--detailDrive, [class*='Annuaire__service']");
          const detected = Boolean(popin || annuaire);
          if (!detected) {
            return { detected: false, inputSet: false, optionSelected: false, serviceSelected: false, continueClicked: false };
          }

          const input = document.querySelector("#wpad-recherche-magasin-input")
            || document.querySelector("input[placeholder*='où' i]")
            || document.querySelector("input[aria-label*='code postal' i]");

          let inputSet = false;
          if (input) {
            try {
              input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
            } catch (error) {
              // Older engines may not support FocusEvent constructor.
            }
            input.value = "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.value = query;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "s" }));
            input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
            input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            inputSet = true;
          }

          const optionCandidates = [
            ...Array.from(document.querySelectorAll("[role='option']")),
            ...Array.from(document.querySelectorAll("li[role='option']")),
            ...Array.from(document.querySelectorAll("[id*='headlessui-combobox-option']")),
            ...Array.from(document.querySelectorAll(".ui-menu-item, .autocomplete-suggestion"))
          ];

          const preferredOption = optionCandidates.find((node) => normalize(node.textContent).includes(normalize(query)));
          const chosenOption = preferredOption || optionCandidates[0] || null;
          let optionSelected = false;
          if (chosenOption) {
            dispatchMouseSequence(chosenOption);
            optionSelected = true;
          }

          const serviceNodes = Array.from(document.querySelectorAll(".Annuaire__service--liste .service-livraison-client, .service-livraison-client, [class*='Annuaire__service'] li, [class*='Annuaire__service'] [data-track-id]"));
          const service = serviceNodes.find((node) => !normalize(node.textContent).includes("indisponible")) || serviceNodes[0] || null;
          let serviceSelected = false;
          if (service) {
            const serviceTarget = service.closest("li, a, button, [role='button'], [data-track-id]") || service;
            dispatchMouseSequence(serviceTarget);
            serviceSelected = true;
          }

          const continueButton = document.querySelector("button.btnWCLD312_Continuer, button[class*='btnWCLD312_Continuer'], button[class*='Continuer'], button.bouton-action");
          let continueClicked = false;
          if (continueButton) {
            const style = window.getComputedStyle(continueButton);
            const rect = continueButton.getBoundingClientRect();
            const isVisible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            if (isVisible) {
              dispatchMouseSequence(continueButton);
              continueClicked = true;
            }
          }

          return { detected: true, inputSet, optionSelected, serviceSelected, continueClicked };
        }, storeQuery);

        if (annuaireResult && annuaireResult.detected) {
          debugLogs.push(`action:annuaire native path input=${annuaireResult.inputSet} option=${annuaireResult.optionSelected} service=${annuaireResult.serviceSelected} continue=${annuaireResult.continueClicked}`);
          await page.waitForTimeout(900);

          if (annuaireResult.optionSelected || annuaireResult.serviceSelected) {
            try {
              await page.waitForLoadState("domcontentloaded", { timeout: DEFAULT_TIMEOUT });
            } catch (error) {
              // Continue even if DOMContentLoaded is already stable or timing out in SPA mode.
            }
            actionRuntime.selectStoreAttempts = 0;
            debugLogs.push(`action:select_store completed via annuaire native path query=${storeQuery}`);
            return true;
          }
        }

        const searchSelectors = normalizeSelectorList(
          action?.selectors?.searchInput,
          [
            "input[placeholder*='Où' i]",
            "input[placeholder*='ou' i]",
            "input[placeholder*='ville' i]",
            "input[placeholder*='code postal' i]",
            "input[aria-label*='magasin' i]",
            "input[name*='store' i]",
            "input[type='search']"
          ]
        );
        const optionSelectors = normalizeSelectorList(
          action?.selectors?.option,
          [
            "li[role='option']",
            "[role='option']",
            ".store-item",
            ".ui-menu-item",
            ".autocomplete-suggestion"
          ]
        );
        const storeCardSelectors = normalizeSelectorList(
          action?.selectors?.storeCard,
          [
            ".Annuaire__service--liste .service-livraison-client",
            ".service-livraison-client",
            ".Annuaire__service--liste li",
            "div.iel-cursor-pointer.iel-rounded.iel-border",
            "[class*='cursor-pointer' i][class*='rounded' i][class*='border' i]",
            "[class*='store-card' i]",
            "[class*='store' i][class*='cursor-pointer' i]"
          ]
        );
        const validateSelectors = normalizeSelectorList(
          action?.selectors?.validate,
          [
            "button[class*='btnWCLD312_Continuer']",
            "button[class*='Continuer']",
            "button[class*='continuer']",
            "button.bouton-action",
            ".icon-arrow-right",
            "svg[aria-label='Continuer']",
            "svg[aria-label*='continuer' i]",
            "button[aria-label*='continuer' i]",
            "button[aria-label*='valider' i]",
            "button[title*='continuer' i]",
            "button[title*='valider' i]",
            "button:has-text('Valider')",
            "button:has-text('Continuer')"
          ]
        );

        const prioritizedSearchSelectors = [ ...searchSelectors ].sort((a, b) => {
          const score = (sel) => {
            const s = String(sel || "").toLowerCase();
            if (s.includes("placeholder") || s.includes("magasin") || s.includes("store") || s.includes("code postal")) return 3;
            if (s.includes("[role='search']") || s.includes("[role=\"search\"]")) return 2;
            if (s.includes("input[type='search']") || s.includes("input[type=\"search\"]")) return 0;
            return 1;
          };
          return score(b) - score(a);
        });

        const prioritizedOptionSelectors = [ ...optionSelectors ].sort((a, b) => {
          const score = (sel) => {
            const s = String(sel || "").toLowerCase();
            if (s.includes("[role='option']") || s.includes("[role=\"option\"]")) return 3;
            if (s.includes("autocomplete") || s.includes("ui-menu-item")) return 2;
            if (s === "li") return 0;
            return 1;
          };
          return score(b) - score(a);
        });

        const searchSelector = await findFirstAvailableSelector(page, prioritizedSearchSelectors);
        if (!searchSelector) {
          debugLogs.push("action:error select_store search input not found");
          return false;
        }

        await withActionRetries(page, "select_store_search", async () => {
          await page.waitForSelector(searchSelector, { state: "visible", timeout: 10000 });
          const input = page.locator(searchSelector).first();
          try {
            await input.fill("");
            await input.fill(storeQuery);
          } catch (error) {
            await page.evaluate(({ selector, query }) => {
              const field = document.querySelector(selector);
              if (!field) return;

              field.value = "";
              field.dispatchEvent(new Event("input", { bubbles: true }));
              field.value = query;
              field.dispatchEvent(new Event("input", { bubbles: true }));
              field.dispatchEvent(new Event("change", { bubbles: true }));
            }, { selector: searchSelector, query: storeQuery });
          }
          await page.waitForTimeout(500);
        }, debugLogs);

        const optionSelector = await findFirstAvailableSelector(page, prioritizedOptionSelectors);
        if (!optionSelector) {
          debugLogs.push("action:error select_store option not found");
          return false;
        }

        await withActionRetries(page, "select_store_option", async () => {
          await page.waitForSelector(optionSelector, { state: "visible", timeout: 10000 });
          const preferredOption = page.locator(optionSelector).filter({ hasText: /paris/i }).first();
          if ((await preferredOption.count()) > 0) {
            await preferredOption.click({ timeout: ACTION_TIMEOUT });
          } else {
            await page.locator(optionSelector).first().click({ timeout: ACTION_TIMEOUT });
          }
          await page.waitForTimeout(500);
        }, debugLogs);

        const storeCardSelector = await findFirstAvailableSelector(page, storeCardSelectors);
        if (storeCardSelector) {
          await withActionRetries(page, "select_store_card", async () => {
            await page.waitForSelector(storeCardSelector, { state: "visible", timeout: 10000 });

            const selected = await page.evaluate((selectors) => {
              const normalize = (txt) => String(txt || "").toLowerCase().replace(/\s+/g, " ").trim();

              for (const selector of selectors) {
                let nodes = [];
                try {
                  nodes = Array.from(document.querySelectorAll(selector));
                } catch (error) {
                  continue;
                }

                for (const node of nodes) {
                  const text = normalize(node.textContent);
                  if (!text || text.includes("indisponible")) {
                    continue;
                  }

                  const innerTarget = node.querySelector(".service-livraison-client, [data-track-id], a, button, [role='button']");
                  const target = innerTarget || node.closest("button, a, [role='button']") || node;

                  const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
                  for (const eventName of events) {
                    target.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
                  }

                  if (typeof target.click === "function") {
                    target.click();
                  }

                  return true;
                }
              }

              return false;
            }, storeCardSelectors);

            if (!selected) {
              throw new Error("select_store service card not selectable");
            }

            await page.waitForTimeout(700);
          }, debugLogs);
        }

        const cssValidateSelectors = validateSelectors.filter((sel) => !sel.includes(":has-text("));
        const continueSelector = cssValidateSelectors.join(", ");

        await withActionRetries(page, "select_store_validate", async () => {
          let clicked = false;

          for (const sel of cssValidateSelectors) {
            try {
              await page.waitForSelector(sel, { state: "visible", timeout: 2500 });
              await page.locator(sel).first().click({ timeout: ACTION_TIMEOUT });
              clicked = true;
              break;
            } catch (error) {
              // Try the next selector candidate.
            }
          }

          if (!clicked) {
            console.log("Clic JS forcé sur la flèche Continuer");
            debugLogs.push("action:select_store_validate JS forced click");
            clicked = await page.evaluate((sels) => {
              for (const sel of sels) {
                const node = document.querySelector(sel);
                if (!node) continue;

                const target = node.closest("button") || node;
                if (!target || typeof target.click !== "function") continue;

                const style = window.getComputedStyle(target);
                const rect = target.getBoundingClientRect();
                const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
                if (!visible) continue;

                target.click();
                return true;
              }

              return false;
            }, cssValidateSelectors);

            if (!clicked) {
              debugLogs.push("action:select_store_validate skipped - continue button not clickable yet");
            }
          }
        }, debugLogs);

        await page.waitForLoadState("domcontentloaded", { timeout: DEFAULT_TIMEOUT });
        try {
          await page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT });
        } catch (error) {
          // Some stores keep background requests open; DOMContentLoaded is enough fallback.
        }

        debugLogs.push(`action:select_store completed with query=${storeQuery}`);
        actionRuntime.selectStoreAttempts = 0;
        return true;
      }

      case "goto": {
        if (!value) {
          debugLogs.push("action:error goto without URL");
          console.error("[DEBUG] goto action failed: URL missing");
          return false;
        }

        await withActionRetries(page, "goto", async () => {
          await page.goto(String(value), { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
          await page.waitForTimeout(POST_ACTION_WAIT_MS);
        }, debugLogs);

        debugLogs.push(`action:goto completed to ${value}`);
        return true;
      }

      case "scroll": {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight);
        });
        await page.waitForTimeout(POST_ACTION_WAIT_MS);

        debugLogs.push(`action:scroll completed`);
        return true;
      }

      case "wait": {
        const requestedMs = parseInt(String(value || "500"), 10);
        const safeMs = Number.isFinite(requestedMs)
          ? Math.min(Math.max(requestedMs, WAIT_MIN_MS), WAIT_MAX_MS)
          : 500;
        await page.waitForTimeout(safeMs);

        debugLogs.push(`action:wait completed (${safeMs}ms)`);
        return true;
      }

      case "done": {
        debugLogs.push("action:done - sequence completed");
        return true;
      }

      case "error": {
        debugLogs.push(`action:error from agent - ${reason}`);
        console.error(`[DEBUG] Agent returned error action: ${reason}`);
        return false;
      }

      default:
        debugLogs.push(`action:unknown type="${actionType}"`);
        console.error(`[DEBUG] Unknown action type: ${actionType}`);
        return false;
    }
  } catch (error) {
    const message = (error && error.message) ? error.message : String(error);
    debugLogs.push(`action:execution_error ${message}`);
    console.error(`[DEBUG] Action execution error: ${message}`);
    return false;
  }
}

async function main() {
  const { store, items, strategy } = parseArgs(process.argv);
  const storeKey = (store || "").toLowerCase();
  const safeStrategy = normalizeStrategy(strategy);

  const storeUrl = STORES[storeKey];
  if (!storeUrl) {
    console.log(JSON.stringify({
      success: false,
      url: null,
      store: storeKey || null,
      items: [],
      errors: ["Enseigne non supportee"],
      details: {}
    }));
    process.exit(1);
  }

  let parsedItems = [];
  try {
    parsedItems = JSON.parse(items || "[]");
  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      url: null,
      store: storeKey,
      items: [],
      errors: ["Format items invalide"],
      details: {}
    }));
    process.exit(1);
  }

  if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
    console.log(JSON.stringify({
      success: false,
      url: null,
      store: storeKey,
      items: [],
      errors: ["La liste des produits est vide"],
      details: {}
    }));
    process.exit(1);
  }

  let browser = null;
  let context = null;
  let page = null;

  const remainingItems = [...parsedItems];
  const addedItems = [];
  const globalErrors = [];
  const debugLogs = [];
  let consecutiveErrors = 0;

  try {
    console.log("Mode debug Playwright activé");
    console.log("Mode Chrome réel activé via CDP");

    browser = await chromium.connectOverCDP("http://localhost:9222");

    const contextOptions = {
      viewport: { width: 1280, height: 800 },
      userAgent: DEBUG_USER_AGENT
    };
    if (existsSync(AUTH_STATE_PATH)) {
      contextOptions.storageState = AUTH_STATE_PATH;
    }

    context = browser.contexts()[0] || await browser.newContext(contextOptions);
    page = await context.newPage();
    if (typeof page.setUserAgent === "function") {
      await page.setUserAgent(DEBUG_USER_AGENT);
    }
    page.setDefaultTimeout(DEFAULT_TIMEOUT);

    debugLogs.push(`init: store=${storeKey} items=${parsedItems.length} strategy=${safeStrategy}`);
    const selectorPack = SELECTORS_BY_STORE[storeKey] || SELECTORS_BY_STORE.default;
    debugLogs.push(`selectors:store=${storeKey} search=${selectorPack.searchInput.length} add=${selectorPack.addToCart.length} popup=${selectorPack.cookieAccept.length}`);

    // Navigate to store home page
    await page.goto(storeUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await page.mouse.move(200, 300);
    await page.waitForTimeout(500);
    await page.waitForTimeout(1200);
    debugLogs.push(`navigation: arrived at ${storeUrl}`);

    actionRuntime = {
      remainingItems,
      debugLogs,
      selectStoreAttempts: 0
    };

    // Main autonomous AI loop
    let iteration = 0;
    while (remainingItems.length > 0) {
      iteration += 1;

      if (iteration > AGENT_LOOP_MAX_ITERATIONS) {
        globalErrors.push(`Limite d'iterations atteinte (${AGENT_LOOP_MAX_ITERATIONS})`);
        debugLogs.push("limit:max_iterations reached");
        break;
      }

      const html = await page.content();
      const url = page.url();

      debugLogs.push(`agent:loop iteration=${iteration} remaining=${remainingItems.length} url=${url}`);

      const action = decideNextAction({
        html,
        url,
        remainingItems,
        strategy: safeStrategy,
        store: storeKey
      });

      debugLogs.push(`agent:decision action=${action.action} reason=${action.reason}`);
      console.log(`[DEBUG] Agent decision: action=${action.action} reason=${action.reason}`);

      if ((action.action || action.type) === "select_store") {
        debugLogs.push("agent:store_selection detected, starting store selection workflow");
      }

      if (action.action === "error") {
        globalErrors.push(action.reason);
        debugLogs.push(`agent:error - ${action.reason}`);
        console.error(`[DEBUG] Agent error: ${action.reason}`);
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) {
          debugLogs.push(`agent:abort - ${consecutiveErrors} erreurs consecutives, abandon`);
          break;
        }
        await page.waitForTimeout(1000);
        continue;
      }

      const currentItem = action.action === "add_to_cart" ? remainingItems[0] : null;

      const success = await executeAction(page, action);
      if ((action.action || action.type) !== "select_store") {
        actionRuntime.selectStoreAttempts = 0;
      }
      if (success) {
        consecutiveErrors = 0;
      } else {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 8) {
          const reason = `Abandon apres ${consecutiveErrors} actions echouees consecutives`;
          globalErrors.push(reason);
          debugLogs.push(`agent:abort - ${reason}`);
          break;
        }
      }

      if (success && action.action === "add_to_cart" && currentItem) {
        addedItems.push(currentItem);
        debugLogs.push(`tracking: added "${currentItem}" (${addedItems.length} / ${parsedItems.length})`);
      }

      if (success && action.action === "done") {
        debugLogs.push("agent:done - all items processed");
        break;
      }

      if (!success) {
        debugLogs.push(`action:failed, will retry`);
      }
    }

    let cartUrl = page.url();
    try {
      const cartLink = page.locator('a[href*="panier" i], a[href*="cart" i]').first();
      if ((await cartLink.count()) > 0) {
        const href = await cartLink.getAttribute("href");
        if (href) {
          cartUrl = new URL(href, page.url()).toString();
        }
      }
    } catch (error) {
      debugLogs.push("cart:url fallback to current page");
    }

    const success = remainingItems.length === 0;

    console.log(JSON.stringify({
      success,
      url: cartUrl,
      store: storeKey,
      items: parsedItems,
      errors: globalErrors,
      details: {
        addedCount: addedItems.length,
        requestedCount: parsedItems.length,
        addedItems,
        // notFoundItems : articles non ajoutés (nom attendu par show.html.erb)
        notFoundItems: remainingItems,
        iterations: iteration,
        strategy: safeStrategy,
        logs: debugLogs.slice(-60)
      }
    }));
  } catch (error) {
    const rawError = String((error && error.message) || error || "Erreur inconnue");
    if (rawError.includes("error while loading shared libraries")) {
      globalErrors.push("Dependances systeme Linux manquantes pour Playwright. Lancez: sudo npx playwright install-deps");
    } else {
      globalErrors.push(rawError);
    }

    console.log(JSON.stringify({
      success: false,
      url: null,
      store: storeKey,
      items: parsedItems,
      errors: globalErrors,
      details: {
        addedCount: addedItems.length,
        remainingItems,
        rawError,
        logs: debugLogs.slice(-60)
      }
    }));

    process.exitCode = 1;
  } finally {
    actionRuntime = null;
    if (context) {
      try {
        await context.storageState({ path: AUTH_STATE_PATH });
      } catch (error) {
        const message = (error && error.message) ? error.message : String(error);
        console.error(`[DEBUG] Unable to persist storage state: ${message}`);
      }
    }
    if (browser) {
      await browser.close();
    }
  }
}

async function withActionRetries(page, actionType, fn, debugLogs) {
  let lastError = null;

  for (let attempt = 1; attempt <= ACTION_MAX_RETRIES + 1; attempt += 1) {
    try {
      await fn();
      if (attempt > 1) {
        debugLogs.push(`action:retry_success type=${actionType} attempt=${attempt}`);
      }
      return;
    } catch (error) {
      lastError = error;
      const message = (error && error.message) ? error.message : String(error);
      debugLogs.push(`action:retry_failed type=${actionType} attempt=${attempt} message=${message}`);

      if (attempt <= ACTION_MAX_RETRIES) {
        await page.waitForTimeout(300 + (attempt * 200));
      }
    }
  }

  throw lastError || new Error(`Action ${actionType} failed after retries`);
}

async function isVisible(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;

  const box = await el.boundingBox();
  if (!box) return false;

  const style = await el.evaluate((node) => {
    const computed = window.getComputedStyle(node);
    return {
      display: computed.display,
      visibility: computed.visibility
    };
  });

  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return box.width > 0 && box.height > 0;
}

function normalizeSelectorList(primarySelectors, fallbackSelectors) {
  const base = Array.isArray(primarySelectors) ? primarySelectors : [];
  const fallback = Array.isArray(fallbackSelectors) ? fallbackSelectors : [];
  return Array.from(new Set([ ...base, ...fallback ].filter(Boolean)));
}

async function findFirstAvailableSelector(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        return selector;
      }
    } catch (error) {
      // Ignore invalid selector or detached DOM race and continue fallback list.
    }
  }

  return null;
}

async function fillVisibleInputWithJsFallback(page, selectors, textValue) {
  try {
    return await page.evaluate(({ candidates, value }) => {
      const isVisibleInput = (el) => {
        if (!el || typeof el.getBoundingClientRect !== "function") {
          return false;
        }

        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return false;
        }

        const style = window.getComputedStyle(el);
        if (!style || style.display === "none" || style.visibility === "hidden") {
          return false;
        }

        return !el.disabled && !el.readOnly;
      };

      for (const selector of candidates) {
        let nodes = [];
        try {
          nodes = Array.from(document.querySelectorAll(selector));
        } catch (error) {
          continue;
        }

        const target = nodes.find(isVisibleInput);
        if (!target) {
          continue;
        }

        target.focus();
        target.value = "";
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.value = String(value || "");
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        target.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));

        if (target.form && typeof target.form.requestSubmit === "function") {
          target.form.requestSubmit();
        } else if (target.form && typeof target.form.submit === "function") {
          target.form.submit();
        }

        return true;
      }

      return false;
    }, { candidates: Array.isArray(selectors) ? selectors : [], value: String(textValue || "") });
  } catch (error) {
    return false;
  }
}

main();
