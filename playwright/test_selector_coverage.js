#!/usr/bin/env node

import assert from "node:assert/strict";
import { LECLERC_ARROW_SELECTORS, SELECTORS, SELECTORS_BY_STORE } from "./agents/navigator_agent.js";

const expectedArrowSelectors = [
  "button:has-text('Lancer la recherche')",
  "a:has-text('Lancer la recherche')",
  "button:has-text('Choisissez votre magasin')",
  "a:has-text('Choisissez votre magasin')",
  "button:has-text('Me géolocaliser')",
  "a:has-text('Faire vos courses')"
];

const expectedOverlaySelectors = [
  "button:has-text('Tout accepter')",
  "button:has-text('Accepter')",
  "button:has-text('Continuer')",
  "button:has-text('Fermer')"
];

for (const selector of expectedArrowSelectors) {
  assert(
    LECLERC_ARROW_SELECTORS.includes(selector),
    `Missing Leclerc selector coverage: ${selector}`
  );
}

for (const selector of expectedOverlaySelectors) {
  assert(
    SELECTORS.popupButtons.includes(selector) || SELECTORS.modalClose.includes(selector),
    `Missing overlay selector coverage: ${selector}`
  );
}

assert(
  SELECTORS_BY_STORE.leclerc.searchInput.includes("input[type='search']"),
  "Leclerc search input should still include generic search fallback"
);

assert(
  SELECTORS_BY_STORE.carrefour.addToCart.some((selector) => selector.includes("Ajouter")),
  "Carrefour add-to-cart selectors should include an add action"
);

assert(
  SELECTORS.searchInput.includes("input[type='search']"),
  "Global search selectors should still include the generic search fallback"
);

assert(
  SELECTORS.addToCart.includes("button[data-testid*='add' i]"),
  "Global add-to-cart selectors should include the data-testid fallback"
);

console.log("Selector coverage validated for the automatic marker/button paths.");