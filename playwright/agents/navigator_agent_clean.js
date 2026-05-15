/**
 * Navigator agent for Drive cart automation.
 *
 * This module analyzes current page HTML + URL + remaining items and returns
 * a strict action object that can be executed by Playwright.
 *
 * Future improvements:
 * - store-specific selector packs
 * - lightweight LLM ranking for selectors
 * - memory of successful selectors per store/session
 */

const ACTIONS = Object.freeze({
  SEARCH: "search",
  CLICK: "click",
  SELECT_STORE: "select_store",
  ADD_TO_CART: "add_to_cart",
  GOTO: "goto",
  SCROLL: "scroll",
  WAIT: "wait",
  DONE: "done",
  ERROR: "error"
});

const STORE_KEYS = Object.freeze({
  LECLERC: "leclerc",
  CARREFOUR: "carrefour",
  INTERMARCHE: "intermarche",
  DEFAULT: "default"
});

const SELECTORS = Object.freeze({
  cookieAccept: [
    "#onetrust-accept-btn-handler",
    "button[id*='accept' i]",
    "button[aria-label*='accepter' i]",
    "button[title*='accepter' i]",
    "button:has-text('Accepter')",
    "button:has-text('Tout accepter')",
    "button:has-text('J'accepte')"
  ],
  searchInput: [
    "input[type='search']",
    "input[name*='search' i]",
    "input[id*='search' i]",
    "input[placeholder*='recherche' i]",
    "input[placeholder*='produit' i]",
    "[role='search'] input",
    "header input[type='text']"
  ],
  searchSubmit: [
    "button[type='submit']",
    "button[aria-label*='recherche' i]",
    "button[title*='recherche' i]",
    "[role='search'] button"
  ],
  productCard: [
    "[data-testid*='product' i]",
    "[data-qa*='product' i]",
    "article[class*='product' i]",
    "article",
    "li[class*='product' i]"
  ],
  firstProductClick: [
    "[data-testid*='product' i] a",
    "article a[href*='produit' i]",
    "article a[href*='product' i]",
    "[class*='product' i] a"
  ],
  addToCart: [
    "button[aria-label*='panier' i]",
    "button[title*='panier' i]",
    "button[data-testid*='add' i]",
    "button:has-text('Ajouter au panier')",
    "button:has-text('Ajouter')",
    "[class*='add' i] button"
  ],
  cartSignals: [
    "[data-testid*='cart' i]",
    "a[href*='panier' i]",
    "a[href*='cart' i]",
    "[aria-label*='panier' i]"
  ],
  modalClose: [
    "button[aria-label*='fermer' i]",
    "button:has-text('Fermer')",
    "button:has-text('Plus tard')",
    "[role='dialog'] button"
  ],
  popupButtons: [
    "button:has-text('Accepter')",
    "button:has-text('Tout accepter')",
    "button:has-text('OK')",
    "button:has-text('Continuer')",
    "button:has-text('Autoriser')",
    "button:has-text('Autoriser la localisation')",
    "button:has-text('J\\'accepte')",
    "button[aria-label*='accepter' i]",
    "button[aria-label*='fermer' i]",
    "button[title*='accepter' i]",
    "[aria-label*='fermer' i]",
    "[aria-label*='close' i]",
    "button:has-text('Choisir mon magasin')",
    "button:has-text('Choisir')",
    "[class*='modal' i] button:has-text('Accepter')",
    "[class*='popup' i] button:has-text('OK')",
    "[data-testid*='modal' i] button"
  ],
  geoLocation: [
    "button:has-text('Autoriser la localisation')",
    "button:has-text('Autoriser')",
    "button[aria-label*='localisation' i]",
    "button[aria-label*='location' i]"
  ],
  storeSelection: [
    "button:has-text('Choisir mon magasin')",
    "button:has-text('Choisir votre magasin')",
    "button:has-text('Choisir')",
    "[data-testid*='store' i] button",
    "[class*='store' i] button"
  ],
  storeSearchInput: [
    "input[type='search']",
    "input[placeholder*='Où' i]",
    "input[placeholder*='ou' i]",
    "input[name*='store' i]",
    "input[aria-label*='magasin' i]"
  ],
  storeOption: [
    "li[role='option']",
    "li",
    ".store-item",
    "[role='option']",
    "[data-testid*='store' i] li"
  ],
  storeValidate: [
    "button:has-text('Valider')",
    "button:has-text('Continuer')",
    "button:has-text('Confirmer')",
    "button[type='submit']"
  ]
});

const SELECTORS_BY_STORE = Object.freeze({
  [STORE_KEYS.LECLERC]: {
    searchInput: [
      "input[type='search']",
      "input[name='q']",
      "input[placeholder*='recherche' i]",
      "header input[type='text']"
    ],
    searchSubmit: [
      "button[type='submit']",
      "button[aria-label*='recherche' i]",
      "button[title*='recherche' i]"
    ],
    productCard: [
      "[data-testid*='product' i]",
      "article[class*='product' i]",
      "li[class*='product' i]"
    ],
    productName: [
      "[data-testid*='product' i] [class*='name' i]",
      "article h2",
      "article h3"
    ],
    price: [
      "[data-testid*='price' i]",
      "[class*='price' i]"
    ],
    pricePerKg: [
      "[data-testid*='price-per' i]",
      "[class*='unit' i]",
      "[class*='kg' i]"
    ],
    addToCart: [
      "button[aria-label*='panier' i]",
      "button:has-text('Ajouter au panier')",
      "button:has-text('Ajouter')"
    ],
    cookieAccept: [
      "#onetrust-accept-btn-handler",
      "button[id*='accept' i]",
      "button:has-text('Tout accepter')",
      "button:has-text('Accepter')"
    ],
    geoLocation: [
      "button:has-text('Autoriser')",
      "button:has-text('Autoriser la localisation')"
    ],
    storeSelection: [
      "button:has-text('Choisir mon magasin')",
      "button:has-text('Choisir votre magasin')",
      "button:has-text('Choisir')"
    ],
    storeSearchInput: [
      "input[type='search']",
      "input[placeholder*='Où' i]",
      "input[placeholder*='code postal' i]",
      "input[placeholder*='ville' i]"
    ],
    storeOption: [
      "li[role='option']",
      ".store-item",
      "[role='option']"
    ],
    storeValidate: [
      "button:has-text('Valider')",
      "button:has-text('Continuer')"
    ],
    storeArrow: [
      ".store-item button[class*='arrow' i]",
      ".store-item div[class*='arrow' i]",
      ".store-item svg[class*='arrow' i]",
      "[class*='store-item' i] button[class*='arrow' i]",
      "[class*='store-item' i] div[class*='arrow' i]",
      "[class*='driveItem' i] button",
      "[class*='drive-item' i] button",
      "[class*='store' i] button[aria-label*='détail' i]",
      "[class*='store' i] button[aria-label*='detail' i]",
      "[class*='store' i] button[aria-label*='voir' i]",
      ".store-item button",
      "[class*='storeCard' i] button",
      "[class*='store-card' i] button"
    ],
    modalClose: [
      "button:has-text('Fermer')",
      "button:has-text('Plus tard')",
      "button[aria-label*='fermer' i]"
    ]
  },
  [STORE_KEYS.CARREFOUR]: {
    searchInput: [
      "input[name='q']",
      "input[aria-label*='Rechercher parmi le contenu du site' i]",
      "#vendor-search-handler",
      "input[placeholder='Pain, lait, oeufs...']"
    ],
    searchSubmit: [
      "button[aria-label*='Lancer la recherche parmi le contenu du site' i]",
      "form button[type='submit']"
    ],
    productCard: [
      "div.by_wrapper",
      "div.by_content",
      "div.by_IC2_19558",
      "article[class*='product' i]"
    ],
    productName: [
      "div.by_content h3",
      "div.by_content h2",
      "[data-testid*='product' i] [class*='name' i]"
    ],
    price: [
      "div.by_price",
      "[class*='price' i]",
      "[data-testid*='price' i]"
    ],
    pricePerKg: [
      "div.by_mentions",
      "[class*='unit' i]",
      "[data-testid*='price-per' i]"
    ],
    addToCart: [
      "button[aria-label*='Ajouter' i]",
      "button[data-testid*='add' i]",
      "button:has-text('Ajouter')"
    ],
    cookieAccept: [
      "#onetrust-accept-btn-handler",
      "button:has-text('Tout accepter')",
      "button:has-text('Accepter')"
    ],
    geoLocation: [
      "button:has-text('Autoriser')",
      "button[aria-label*='localisation' i]"
    ],
    storeSelection: [
      "button:has-text('Choisir mon magasin')",
      "button:has-text('Choisir')",
      "button[data-testid*='pill-group__button' i]"
    ],
    storeSearchInput: [
      "input[type='search']",
      "input[placeholder*='ville' i]",
      "input[placeholder*='code postal' i]",
      "input[aria-label*='magasin' i]"
    ],
    storeOption: [
      "li[role='option']",
      "[role='option']",
      ".store-item"
    ],
    storeValidate: [
      "button:has-text('Valider')",
      "button:has-text('Continuer')",
      "button:has-text('Choisir')"
    ],
    modalClose: [
      "button[aria-label*='Fermer' i]",
      "button[aria-label*='Close' i]",
      "button:has-text('Fermer')",
      "button:has-text('Plus tard')"
    ]
  },
  [STORE_KEYS.INTERMARCHE]: {
    searchInput: [
      "input[type='search']",
      "input[name='q']",
      "input[placeholder*='recherche' i]"
    ],
    searchSubmit: [
      "button[type='submit']",
      "button[aria-label*='recherche' i]"
    ],
    productCard: [
      "[data-testid*='product' i]",
      "article[class*='product' i]",
      "li[class*='product' i]"
    ],
    productName: [
      "[data-testid*='product' i] [class*='name' i]",
      "article h2",
      "article h3"
    ],
    price: [
      "[data-testid*='price' i]",
      "[class*='price' i]"
    ],
    pricePerKg: [
      "[data-testid*='price-per' i]",
      "[class*='kg' i]",
      "[class*='unit' i]"
    ],
    addToCart: [
      "button[aria-label*='panier' i]",
      "button:has-text('Ajouter au panier')",
      "button:has-text('Ajouter')"
    ],
    cookieAccept: [
      "#onetrust-accept-btn-handler",
      "button:has-text('Tout accepter')",
      "button:has-text('Accepter')"
    ],
    geoLocation: [
      "button:has-text('Autoriser')",
      "button:has-text('Autoriser la localisation')"
    ],
    storeSelection: [
      "button:has-text('Choisir mon magasin')",
      "button:has-text('Choisir votre magasin')",
      "button:has-text('Choisir')"
    ],
    storeSearchInput: [
      "input[type='search']",
      "input[placeholder*='Où' i]",
      "input[placeholder*='code postal' i]",
      "input[placeholder*='ville' i]"
    ],
    storeOption: [
      "li[role='option']",
      ".store-item",
      "[role='option']"
    ],
    storeValidate: [
      "button:has-text('Valider')",
      "button:has-text('Continuer')"
    ],
    modalClose: [
      "button:has-text('Fermer')",
      "button:has-text('Plus tard')",
      "button[aria-label*='fermer' i]"
    ]
  },
  [STORE_KEYS.DEFAULT]: {
    searchInput: SELECTORS.searchInput,
    searchSubmit: SELECTORS.searchSubmit,
    productCard: SELECTORS.productCard,
    productName: ["[data-testid*='product' i] [class*='name' i]", "article h2", "article h3"],
    price: ["[class*='price' i]", "[data-testid*='price' i]"],
    pricePerKg: ["[class*='unit' i]", "[class*='kg' i]", "[data-testid*='price-per' i]"],
    addToCart: SELECTORS.addToCart,
    cookieAccept: SELECTORS.cookieAccept,
    geoLocation: SELECTORS.geoLocation,
    storeSelection: SELECTORS.storeSelection,
    storeSearchInput: SELECTORS.storeSearchInput,
    storeOption: SELECTORS.storeOption,
    storeValidate: SELECTORS.storeValidate,
    modalClose: SELECTORS.modalClose
  }
});

function createDebugLogger() {
  const entries = [];

  return {
    push(message) {
      const line = `[navigator_agent] ${new Date().toISOString()} ${message}`;
      entries.push(line);
      if (entries.length > 200) {
        entries.shift();
      }
    },
    read() {
      return entries.slice();
    }
  };
}

const logger = createDebugLogger();

const storeSelectionState = {
  storeKey: null,
  requested: false,
  storeSelected: false
};

function syncStoreSelectionState(storeKey, isStoreSelectionPage) {
  if (storeSelectionState.storeKey !== storeKey) {
    storeSelectionState.storeKey = storeKey;
    storeSelectionState.requested = false;
    storeSelectionState.storeSelected = false;
    return;
  }

  // A store selection is considered successful once we have issued select_store
  // and the dedicated store-selection page is no longer detected.
  if (!isStoreSelectionPage && storeSelectionState.requested && !storeSelectionState.storeSelected) {
    storeSelectionState.storeSelected = true;
  }
}

/**
 * Main decision function expected by build_cart.js.
 * Always returns a strict JSON-like object:
 * { action, selector, value, reason }
 */
function decideNextAction({ html, url, remainingItems, strategy = "cheapest", store = null }) {
  try {
    const safeHtml = String(html || "");
    const safeUrl = String(url || "");
    const items = normalizeItems(remainingItems);
    const safeStrategy = normalizeStrategy(strategy);
    const storeKey = detectStoreKey({ url: safeUrl, store });
    const selectors = getSelectorsForStore(storeKey);
    const isStoreSelectionPage = detectStoreSelectionPage(safeHtml);
    const isCatalogReady = detectCatalogReady(safeHtml, safeUrl);

    syncStoreSelectionState(storeKey, isStoreSelectionPage);

    logger.push(`decision:start store=${storeKey} url=${safeUrl} items=${items.length} strategy=${safeStrategy}`);

    if (!safeHtml.trim()) {
      return actionError("Page vide ou HTML indisponible");
    }

    const blockedReason = detectBlockedPage(safeHtml, safeUrl);
    if (blockedReason) {
      return actionError(blockedReason);
    }

    if (items.length === 0) {
      return actionDone("Tous les produits sont traites");
    }

    if (isCatalogReady) {
      const catalogSearchSelector = findCatalogSearchInput(safeHtml, selectors)
        || findSearchInput(safeHtml, selectors)
        || (selectors.searchInput && selectors.searchInput[0])
        || (SELECTORS.searchInput && SELECTORS.searchInput[0])
        || "input[type='search']";

      return actionSearch(catalogSearchSelector, items[0], "Catalogue/recherche detecte, priorite recherche produit");
    }

    // Bloc "popup avant continuation" désactivé
    // const popup = detectPopup(safeHtml, selectors);
    // if (popup) {
    //   logger.push(`popup:detected reason=${popup.reason}`);
    //   return popup;
    // }

    // Détection popup cookies désactivée.

    // Fermeture des modales résiduelles désactivée.
    // const modalSelector = findFirstSelectorInHtml(safeHtml, selectors.modalClose || SELECTORS.modalClose);
    // if (modalSelector) {
    //   logger.push(`modal:detected selector=${modalSelector}`);
    //   return actionClick(modalSelector, "Popup detecte, fermeture avant continuation");
    // }

    if (isStoreSelectionPage) {
      logger.push("store_selection:detected");

      if (storeSelectionState.storeSelected) {
        logger.push("store_selection:already_selected skip_select_store");
        return actionWait("Magasin deja selectionne, attente de transition");
      }

      if (storeSelectionState.requested) {
        logger.push("store_selection:request_already_sent wait_transition");
        return actionWait("Selection magasin deja envoyee, attente de validation");
      }

      const storeSelectionAction = actionSelectStore("Paris", selectors);
      if (storeSelectionAction) {
        storeSelectionState.requested = true;
        return storeSelectionAction;
      }
    }

    const pageType = detectPageType(safeHtml, safeUrl);
    logger.push(`pageType:${pageType}`);

    if (pageType === "home") {
      const searchSelector = findSearchInput(safeHtml, selectors);
      if (!searchSelector) {
        return actionError("Aucune barre de recherche detectee sur la page d'accueil");
      }

      return actionSearch(searchSelector, items[0], "Accueil detecte, lancement de la recherche");
    }

    if (pageType === "results") {
      const extractedProducts = extractProductsFromHtml(safeHtml, selectors);
      logger.push(`results:products_extracted=${extractedProducts.length}`);

      const bestProduct = chooseBestProduct(extractedProducts, safeStrategy);
      if (bestProduct && bestProduct.selector) {
        return actionClick(
          bestProduct.selector,
          `Produit selectionne selon la strategie (${safeStrategy}): ${bestProduct.name}`
        );
      }

      const addSelector = findAddToCartButton(safeHtml, selectors);
      if (addSelector) {
        return actionClick(addSelector, "Resultats detectes, fallback ajout direct");
      }

      const firstProduct = findFirstSelectorInHtml(safeHtml, SELECTORS.firstProductClick)
        || findFirstSelectorInHtml(safeHtml, selectors.productCard || SELECTORS.productCard);

      if (firstProduct) {
        return actionClick(firstProduct, "Resultats detectes, ouverture du premier produit");
      }

      if (hasNoResultSignal(safeHtml)) {
        return actionScroll("Aucun resultat visible, tentative de scroll pour charger plus");
      }

      return actionError("Page de resultats detectee mais aucun selecteur produit utilisable");
    }

    if (pageType === "product") {
      const addSelector = findAddToCartButton(safeHtml, selectors);
      if (!addSelector) {
        return actionError("Fiche produit detectee mais bouton Ajouter au panier introuvable");
      }

      return actionAddToCart(addSelector, "Fiche produit detectee, ajout au panier");
    }

    if (pageType === "cart") {
      const searchSelector = findSearchInput(safeHtml, selectors);
      if (searchSelector) {
        return actionSearch(searchSelector, items[0], "Panier detecte, passage au produit suivant");
      }

      return actionDone("Panier detecte sans barre de recherche, fin de sequence");
    }

    const fallbackSearch = findSearchInput(safeHtml, selectors);
    if (fallbackSearch) {
      return actionSearch(fallbackSearch, items[0], "Type de page ambigu, fallback recherche");
    }

    return actionWait("Type de page ambigu, attente avant nouvelle analyse");
  } catch (error) {
    logger.push(`decision:error ${error.message}`);
    return actionError(`Erreur agent: ${error.message}`);
  }
}

/**
 * Detect high-level page type from URL + HTML clues.
 *
 * Ordre de priorité :
 * 1. URL racine du domaine → toujours home (avant tout autre test)
 * 2. Panier / cart
 * 3. Fiche produit
 * 4. Page de résultats
 * 5. Accueil (détecté par HTML, sans barre de recherche qui est présente partout)
 * 6. Inconnu
 *
 * Note : `hasAnySelectorHint(lowerHtml, SELECTORS.searchInput)` N'EST PLUS utilisé pour home
 * car toutes les pages d'un drive ont une barre de recherche dans le header.
 */
function detectPageType(html, url) {
  const lowerHtml = html.toLowerCase();
  const lowerUrl = url.toLowerCase();
  const safeUrl = String(url || "");

  // 1. URL racine (ex: https://www.leclercdrive.fr/ ou https://courses.carrefour.fr/)
  //    Prise en compte avant tout autre signal pour éviter que les produits mis en avant
  //    sur la home ne déclenchent à tort une détection "results".
  if (/^https?:\/\/[^/]+\/?$/.test(safeUrl)) {
    return "home";
  }

  // 2. Panier
  const isCart =
    lowerUrl.includes("panier")
    || lowerUrl.includes("cart")
    || includesAny(lowerHtml, ["mon panier", "votre panier", "total panier", "checkout"])
    || hasAnySelectorHint(lowerHtml, SELECTORS.cartSignals);
  if (isCart) {
    return "cart";
  }

  // 3. Fiche produit
  const isProduct =
    lowerUrl.includes("produit")
    || lowerUrl.includes("product")
    || (includesAny(lowerHtml, ["description", "caracteristiques"]) && !hasAnySelectorHint(lowerHtml, SELECTORS.productCard));
  if (isProduct) {
    return "product";
  }

  // 4. Page de résultats de recherche
  const isResults =
    lowerUrl.includes("recherche")
    || lowerUrl.includes("search")
    || lowerUrl.includes("result")
    || includesAny(lowerHtml, ["resultats", "résultats", "produits trouves", "tri", "filtrer"])
    || hasAnySelectorHint(lowerHtml, SELECTORS.productCard);
  if (isResults) {
    return "results";
  }

  // 5. Accueil (détecté par contenu HTML spécifique à la home, pas la barre de recherche)
  const isHome =
    /\/\/?$/.test(lowerUrl)
    || includesAny(lowerHtml, ["bienvenue", "nos rayons", "choisir mon magasin"]);
  if (isHome) {
    return "home";
  }

  return "unknown";
}

/**
 * Return best matching search input selector or null.
 */
function findSearchInput(html, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  return findFirstSelectorInHtml(html, selectors.searchInput || SELECTORS.searchInput);
}

function findCatalogSearchInput(html, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  const preferred = [
    "input[name='q']",
    "input[id*='search' i]",
    "input[placeholder*='recherche' i]",
    "input[placeholder*='produit' i]",
    "input[aria-label*='recherche' i]",
    "input[type='search']"
  ];

  const merged = uniqueSelectors([
    ...preferred,
    ...((selectors && selectors.searchInput) || []),
    ...SELECTORS.searchInput
  ]).filter((selector) => {
    const lower = String(selector || "").toLowerCase();
    return !lower.includes("placeholder*='où'")
      && !lower.includes('placeholder*="où"')
      && !lower.includes("placeholder*='ou'")
      && !lower.includes('placeholder*="ou"')
      && !lower.includes("code postal")
      && !lower.includes("magasin");
  });

  return findFirstSelectorInHtml(html, merged);
}

function detectCatalogReady(html, url) {
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes("/catalogue/") || lowerUrl.includes("/recherche/")) {
    return true;
  }

  const safeHtml = String(html || "");
  return hasVisibleHtmlMatch(safeHtml, [
    /<input[^>]*name=["']q["'][^>]*>/gi,
    /<input[^>]*id=["'][^"']*search[^"']*["'][^>]*>/gi,
    /<input[^>]*placeholder=["'][^"']*(?:recherche|produit)[^"']*["'][^>]*>/gi,
    /<input[^>]*aria-label=["'][^"']*recherche[^"']*["'][^>]*>/gi
  ]);
}

/**
 * Return best matching add-to-cart selector or null.
 */
function findAddToCartButton(html, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  return findFirstSelectorInHtml(html, selectors.addToCart || SELECTORS.addToCart);
}

/**
 * Extract product candidates from result page HTML.
 *
 * Returned shape:
 * [
 *   {
 *     name: "Pates Barilla 500g",
 *     price: 1.29,
 *     pricePerKg: 2.58,
 *     quantity: "500g",
 *     selector: "button:has-text('Ajouter')"
 *   }
 * ]
 */
function extractProductsFromHtml(html, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  try {
    const safeHtml = String(html || "");
    if (!safeHtml.trim()) {
      return [];
    }

    const blocks = extractProductBlocks(safeHtml);
    const products = [];

    for (const block of blocks) {
      try {
        const plain = stripHtmlTags(block).replace(/\s+/g, " ").trim();
        if (!plain) {
          continue;
        }

        const name = extractProductName(plain);
        const price = parsePrice(plain);
        if (!isFiniteNumber(price) || price <= 0) {
          continue;
        }

        const quantityInfo = parseQuantity(plain);
        const displayedPerKg = parseDisplayedPricePerKg(plain);
        const computedPerKg = computePricePerKg(price, quantityInfo.quantityInGrams);
        const finalPerKg = isFiniteNumber(displayedPerKg) ? displayedPerKg : computedPerKg;

        const selector = detectAddSelectorInBlock(block, selectors)
          || findAddToCartButton(block, selectors)
          || (selectors.addToCart && selectors.addToCart[0])
          || SELECTORS.addToCart[0]
          || null;

        products.push({
          name,
          price,
          pricePerKg: isFiniteNumber(finalPerKg) ? roundTo(finalPerKg, 4) : null,
          quantity: quantityInfo.raw || null,
          selector,
          _meta: {
            quantityInGrams: quantityInfo.quantityInGrams,
            normalizedUnit: quantityInfo.normalizedUnit,
            source: isFiniteNumber(displayedPerKg) ? "displayed" : "computed"
          }
        });
      } catch (error) {
        logger.push(`extract:block_error ${error.message}`);
      }
    }

    return deduplicateProducts(products)
      .filter((product) => isFiniteNumber(product.price) && product.price > 0)
      .map((product) => ({
        name: product.name,
        price: product.price,
        pricePerKg: isFiniteNumber(product.pricePerKg) ? product.pricePerKg : null,
        quantity: product.quantity,
        selector: product.selector
      }));
  } catch (error) {
    logger.push(`extract:error ${error.message}`);
    return [];
  }
}

/**
 * Parse price from text.
 * Supports formats like: 1,29 €, 2.50€, €1.10
 */
function parsePrice(text) {
  try {
    const source = String(text || "");

    const euroAfterSpaced = source.match(/(\d{1,4})\s*[,.]\s*(\d{1,2})\s*€/i);
    if (euroAfterSpaced) {
      return toFloatPrice(`${euroAfterSpaced[1]}.${euroAfterSpaced[2]}`);
    }

    const euroAfter = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i);
    if (euroAfter) {
      return toFloatPrice(euroAfter[1]);
    }

    const euroBefore = source.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
    if (euroBefore) {
      return toFloatPrice(euroBefore[1]);
    }

    const fallback = source.match(/\b(\d{1,4}[.,]\d{1,2})\b/);
    if (fallback) {
      return toFloatPrice(fallback[1]);
    }

    return null;
  } catch (error) {
    logger.push(`parsePrice:error ${error.message}`);
    return null;
  }
}

/**
 * Parse quantity from text and normalize to grams or milliliters.
 * Supports: 500g, 1kg, 3x200g, 750 ml, 1L, 6x33cl, etc.
 */
function parseQuantity(text) {
  const safeText = String(text || "");
  const normalized = safeText.replace(/\s+/g, " ").trim().toLowerCase();

  try {
    // Pack pattern: 3x200g, 2 x 1l, etc.
    const packMatch = normalized.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl)\b/i);
    if (packMatch) {
      const packCount = parseInt(packMatch[1], 10);
      const unitValue = parseFloat(String(packMatch[2]).replace(",", "."));
      const unit = packMatch[3].toLowerCase();

      const singleNorm = normalizeUnitToBase(unitValue, unit);
      const totalBaseValue = singleNorm.baseValue * packCount;

      return {
        raw: `${packMatch[1]}x${packMatch[2]}${packMatch[3]}`,
        quantityInGrams: isFiniteNumber(totalBaseValue) ? totalBaseValue : null,
        normalizedValue: isFiniteNumber(totalBaseValue) ? totalBaseValue : null,
        normalizedUnit: singleNorm.baseUnit
      };
    }

    // Single quantity pattern: 500g, 1kg, 750 ml, 1L
    const singleMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl)\b/i);
    if (singleMatch) {
      const value = parseFloat(String(singleMatch[1]).replace(",", "."));
      const unit = singleMatch[2].toLowerCase();
      const norm = normalizeUnitToBase(value, unit);

      return {
        raw: `${singleMatch[1]}${singleMatch[2]}`,
        quantityInGrams: isFiniteNumber(norm.baseValue) ? norm.baseValue : null,
        normalizedValue: isFiniteNumber(norm.baseValue) ? norm.baseValue : null,
        normalizedUnit: norm.baseUnit
      };
    }

    // Fallback for unit products: x12, lot de 6, etc.
    const unitsMatch = normalized.match(/(?:x|lot\s*de\s*)(\d+)\b/i);
    if (unitsMatch) {
      return {
        raw: unitsMatch[0],
        quantityInGrams: null,
        normalizedValue: parseInt(unitsMatch[1], 10),
        normalizedUnit: "unit"
      };
    }

    return {
      raw: null,
      quantityInGrams: null,
      normalizedValue: null,
      normalizedUnit: null
    };
  } catch (error) {
    logger.push(`parseQuantity:error ${error.message}`);
    return {
      raw: null,
      quantityInGrams: null,
      normalizedValue: null,
      normalizedUnit: null
    };
  }
}

/**
 * Compute price per kg/l from total price and quantity normalized to g/ml.
 * The parameter name follows the requested contract.
 */
function computePricePerKg(price, quantityInGrams) {
  const safePrice = Number(price);
  const safeQuantity = Number(quantityInGrams);

  if (!isFiniteNumber(safePrice) || !isFiniteNumber(safeQuantity) || safePrice <= 0 || safeQuantity <= 0) {
    return null;
  }

  // Quantity is normalized to grams or milliliters. Convert to per 1000 base units.
  return roundTo((safePrice / safeQuantity) * 1000, 4);
}

/**
 * Choose the best product based on strategy:
 * - cheapest: lowest total price
 * - best_per_kg: lowest pricePerKg
 */
function chooseBestProduct(products, strategy) {
  try {
    const safeStrategy = normalizeStrategy(strategy);
    const candidates = Array.isArray(products) ? products.filter(validProductCandidate) : [];
    if (candidates.length === 0) {
      return null;
    }

    if (safeStrategy === "best_per_kg") {
      const withPerKg = candidates
        .map((product) => ({
          ...product,
          _scorePerKg: isFiniteNumber(product.pricePerKg) ? Number(product.pricePerKg) : null
        }))
        .filter((product) => isFiniteNumber(product._scorePerKg) && product._scorePerKg > 0);

      if (withPerKg.length > 0) {
        withPerKg.sort((a, b) => a._scorePerKg - b._scorePerKg || a.price - b.price);
        return withoutPrivateKeys(withPerKg[0]);
      }
    }

    // Default fallback and "cheapest" strategy.
    const cheapest = candidates
      .slice()
      .sort((a, b) => a.price - b.price || coalesceNumber(a.pricePerKg, Infinity) - coalesceNumber(b.pricePerKg, Infinity));

    return cheapest[0] || null;
  } catch (error) {
    logger.push(`chooseBestProduct:error ${error.message}`);
    return null;
  }
}

/**
 * Detect cookie banner and provide an accept selector.
 */
function detectCookieBanner(html, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  const lower = html.toLowerCase();
  const bannerDetected = includesAny(lower, [
    "cookie",
    "cookies",
    "consent",
    "consentement",
    "onetrust",
    "privacy"
  ]);

  if (!bannerDetected) {
    return { detected: false, selector: null };
  }

  const selector = findFirstSelectorInHtml(html, selectors.cookieAccept || SELECTORS.cookieAccept)
    || findFirstSelectorInHtml(html, selectors.modalClose || SELECTORS.modalClose);

  return {
    detected: true,
    selector
  };
}

/**
 * Detect and close common popups:
 * - Cookie consent banners (Accepter, Tout accepter, OK)
 * - Geolocation requests
 * - Store selection modals
 * - Generic close/continue buttons
 *
 * Returns an action to click the popup close button, or null if no popup detected.
 */
function detectPopup(html, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  const lower = html.toLowerCase();

  // Détection popup cookies désactivée.

  // Détection popup géolocalisation désactivée
  // const geoPatterns = ["localisation", "location", "localizer", "geolocation", "géolocalisation"];
  // if (includesAny(lower, geoPatterns)) {
  //   let selector = findFirstSelectorInHtml(html, [
  //     ...(selectors.geoLocation || []),
  //     "button:has-text('Autoriser')",
  //     "button:has-text('Autoriser la localisation')",
  //     "button[aria-label*='localisation' i]",
  //     "button[aria-label*='location' i]"
  //   ]);
  //   if (selector) {
  //     return {
  //       action: "click",
  //       selector,
  //       reason: "Popup geolocalisation detecte, fermeture"
  //     };
  //   }
  // }

  // Détection modal promo désactivée
  // const promoPatterns = [
  //   "promo",
  //   "promotion",
  //   "offre",
  //   "newsletter",
  //   "%",
  //   "code promo",
  //   "bon de reduction"
  // ];
  // if (includesAny(lower, promoPatterns)) {
  //   const promoSelector = findFirstSelectorInHtml(html, [
  //     "button:has-text('Fermer')",
  //     "button:has-text('Plus tard')",
  //     "button:has-text('Non merci')",
  //     "button:has-text('Continuer sans offre')",
  //     "[class*='modal' i] button",
  //     "[class*='popup' i] button"
  //   ]);
  //   if (promoSelector) {
  //     return {
  //       action: "click",
  //       selector: promoSelector,
  //       reason: "Modal promo detecte, fermeture"
  //     };
  //   }
  // }

  // Détection popup générique désactivée
  // const closeSelector = findFirstSelectorInHtml(html, [
  //   ...(selectors.modalClose || []),
  //   "button:has-text('Fermer')",
  //   "button[aria-label*='fermer' i]",
  //   "[aria-label*='close' i]",
  //   "[role='dialog'] [aria-label*='fermer' i]",
  //   "[role='dialog'] button:has-text('Fermer')",
  //   "[class*='modal' i] button:has-text('Fermer')"
  // ]);
  // if (closeSelector && (lower.includes("modal") || lower.includes("popup") || lower.includes("dialog"))) {
  //   return {
  //     action: "click",
  //     selector: closeSelector,
  //     reason: "Popup generique detecte, fermeture"
  //   };
  // }

  return null;
}

function hasNoResultSignal(html) {
  const lower = html.toLowerCase();
  return includesAny(lower, [
    "aucun resultat",
    "aucun résultat",
    "0 resultat",
    "0 résultat",
    "indisponible"
  ]);
}

function normalizeStrategy(strategy) {
  const value = String(strategy || "").trim().toLowerCase();
  return value === "best_per_kg" ? "best_per_kg" : "cheapest";
}

function parseDisplayedPricePerKg(text) {
  const source = String(text || "");
  const spacedMatch = source.match(/(\d{1,4})\s*[,.]\s*(\d{1,4})\s*€\s*\/\s*(kg|kilo|l|litre)/i);
  if (spacedMatch) {
    return toFloatPrice(`${spacedMatch[1]}.${spacedMatch[2]}`);
  }
  const match = source.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre)/i);
  if (!match) {
    return null;
  }

  return toFloatPrice(match[1]);
}

function extractProductBlocks(html) {
  const blocks = [];
  const safeHtml = String(html || "");

  const patterns = [
    /<(article|li|div)[^>]*(?:product|produit|result|card)[^>]*>[\s\S]*?<\/(article|li|div)>/gi,
    /<(article|li)[^>]*>[\s\S]*?<\/(article|li)>/gi
  ];

  for (const pattern of patterns) {
    const matches = safeHtml.match(pattern);
    if (matches && matches.length > 0) {
      blocks.push(...matches);
    }
  }

  if (blocks.length === 0) {
    // Last fallback: split around repeated buttons likely tied to products.
    const chunks = safeHtml.split(/<button[^>]*>/i).slice(0, 40);
    for (const chunk of chunks) {
      if (chunk.length > 30 && /€|euro|g\b|kg\b|ml\b|\bl\b/i.test(chunk)) {
        blocks.push(chunk);
      }
    }
  }

  return blocks.slice(0, 120);
}

function extractProductName(plainText) {
  const text = String(plainText || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "Produit inconnu";
  }

  // Try to keep the part before the first visible price.
  const priceIndex = text.search(/\d{1,4}(?:[.,]\d{1,2})?\s*€/i);
  if (priceIndex > 8) {
    return text.slice(0, priceIndex).trim().slice(0, 120);
  }

  return text.slice(0, 120);
}

function detectAddSelectorInBlock(blockHtml, selectors = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT]) {
  const lower = String(blockHtml || "").toLowerCase();

  const addSelectors = selectors.addToCart || SELECTORS.addToCart;
  for (const selector of addSelectors) {
    if (selectorLikelyPresentInHtml(lower, selector)) {
      return selector;
    }
  }

  return null;
}

function deduplicateProducts(products) {
  const seen = new Set();
  const result = [];

  for (const product of products) {
    const key = `${String(product.name || "").toLowerCase()}|${product.price}|${product.quantity || ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(product);
  }

  return result;
}

function normalizeUnitToBase(value, unit) {
  const safeValue = Number(value);
  const safeUnit = String(unit || "").toLowerCase();

  if (!isFiniteNumber(safeValue) || safeValue <= 0) {
    return { baseValue: null, baseUnit: null };
  }

  if (safeUnit === "kg") {
    return { baseValue: safeValue * 1000, baseUnit: "g" };
  }

  if (safeUnit === "g") {
    return { baseValue: safeValue, baseUnit: "g" };
  }

  if (safeUnit === "l") {
    return { baseValue: safeValue * 1000, baseUnit: "ml" };
  }

  if (safeUnit === "cl") {
    return { baseValue: safeValue * 10, baseUnit: "ml" };
  }

  if (safeUnit === "ml") {
    return { baseValue: safeValue, baseUnit: "ml" };
  }

  return { baseValue: null, baseUnit: null };
}

function toFloatPrice(value) {
  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return isFiniteNumber(parsed) ? roundTo(parsed, 4) : null;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function coalesceNumber(value, fallback) {
  return isFiniteNumber(value) ? Number(value) : fallback;
}

function validProductCandidate(product) {
  return !!product
    && typeof product === "object"
    && isFiniteNumber(product.price)
    && Number(product.price) > 0
    && typeof product.name === "string"
    && product.name.length > 0
    && typeof product.selector === "string"
    && product.selector.length > 0;
}

function withoutPrivateKeys(product) {
  const clone = { ...product };
  delete clone._scorePerKg;
  return clone;
}

function stripHtmlTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&euro;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnySelectorHint(html, selectorList) {
  return selectorList.some((selector) => {
    const hint = selectorToHtmlHint(selector);
    return hint && html.toLowerCase().includes(hint);
  });
}

function selectorToHtmlHint(selector) {
  const token = String(selector || "")
    .replace(/[:.#\[\]\(\)'"=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .find((part) => part.length >= 4);

  return token ? token.toLowerCase() : null;
}

function findFirstSelectorInHtml(html, selectors) {
  const lower = String(html || "").toLowerCase();

  for (const selector of selectors) {
    if (selectorLikelyPresentInHtml(lower, selector)) {
      logger.push(`selector:matched ${selector}`);
      return selector;
    }
  }

  return null;
}

function findFirstVisibleSelectorInHtml(html, selectors) {
  const safeHtml = String(html || "");
  const lower = safeHtml.toLowerCase();

  for (const selector of selectors) {
    if (selectorLikelyPresentInHtml(lower, selector) && selectorLikelyVisibleInHtml(safeHtml, selector)) {
      logger.push(`selector:visible_match ${selector}`);
      return selector;
    }
  }

  return null;
}

function isElementVisible(html, selector) {
  const safeHtml = String(html || "");
  const safeSelector = String(selector || "").trim();
  if (!safeHtml || !safeSelector) {
    return false;
  }

  // Prefer a real DOM check when available (browser-like runtime).
  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(safeHtml, "text/html");
      const el = doc.querySelector(safeSelector);
      if (!el) return false;

      const style = String(el.getAttribute("style") || "").toLowerCase().replace(/\s+/g, "");
      if (style.includes("display:none") || style.includes("visibility:hidden")) {
        return false;
      }

      return true;
    } catch (error) {
      // Fallback below for selectors unsupported by querySelector (e.g. :has-text).
    }
  }

  // Node/runtime fallback: heuristic visibility check from raw HTML.
  return selectorLikelyVisibleInHtml(safeHtml, safeSelector);
}

function selectorLikelyVisibleInHtml(html, selector) {
  const safeHtml = String(html || "");
  const loweredSelector = String(selector || "").toLowerCase();

  const hiddenSignals = [
    "display:none",
    "display: none",
    "visibility:hidden",
    "visibility: hidden",
    "aria-hidden=\"true\"",
    "aria-hidden='true'",
    " hidden",
    "class=\"hidden",
    "class='hidden"
  ];

  const isHiddenFragment = (fragment) => {
    const lowerFragment = String(fragment || "").toLowerCase();
    return hiddenSignals.some((signal) => lowerFragment.includes(signal));
  };

  if (loweredSelector.startsWith("#")) {
    const idValue = loweredSelector.slice(1).trim();
    if (!idValue) {
      return false;
    }

    const idRegex = new RegExp(`<[^>]*id=["']${escapeRegExp(idValue)}["'][^>]*>`, "i");
    const match = safeHtml.match(idRegex);
    if (!match) {
      return false;
    }

    return !isHiddenFragment(match[0]);
  }

  const hasTextMatch = loweredSelector.match(/has-text\((['"])(.*?)\1\)/i);
  if (hasTextMatch) {
    const needle = String(hasTextMatch[2] || "").trim().toLowerCase();
    if (!needle) {
      return false;
    }

    const buttonRegex = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
    const candidates = safeHtml.match(buttonRegex) || [];
    for (const candidate of candidates) {
      const lowerCandidate = candidate.toLowerCase();
      if (lowerCandidate.includes(needle) && !isHiddenFragment(lowerCandidate)) {
        return true;
      }
    }

    return false;
  }

  const keywordMatch = loweredSelector.match(/\*=['"]([^'"]+)['"]/i);
  if (keywordMatch) {
    const keyword = String(keywordMatch[1] || "").trim().toLowerCase();
    if (!keyword) {
      return false;
    }

    const tagRegex = /<(button|a|div)[^>]*>/gi;
    const tags = safeHtml.match(tagRegex) || [];
    for (const tag of tags) {
      const lowerTag = tag.toLowerCase();
      if (lowerTag.includes(keyword) && !isHiddenFragment(lowerTag)) {
        return true;
      }
    }

    return false;
  }

  return true;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectorLikelyPresentInHtml(lowerHtml, selector) {
  const loweredSelector = String(selector || "").toLowerCase();

  if (loweredSelector.startsWith("#")) {
    const idValue = loweredSelector.slice(1);
    if (!idValue) {
      return false;
    }

    return lowerHtml.includes(`id=\"${idValue}\"`) || lowerHtml.includes(`id='${idValue}'`);
  }

  const ariaContainsMatch = loweredSelector.match(/aria-label\*=['\"]([^'\"]+)['\"]/i);
  if (ariaContainsMatch) {
    const needle = String(ariaContainsMatch[1] || "").trim().toLowerCase();
    if (!needle) {
      return false;
    }

    return lowerHtml.includes("aria-label") && lowerHtml.includes(needle) && lowerHtml.includes("<button");
  }

  // Handle Playwright pseudo-text selectors such as button:has-text('Accepter').
  const hasTextMatch = loweredSelector.match(/has-text\((['"])(.*?)\1\)/i);
  if (hasTextMatch) {
    const needle = String(hasTextMatch[2] || "").trim().toLowerCase();
    return needle.length > 0 && lowerHtml.includes(needle) && lowerHtml.includes("<button");
  }

  const ignoredTokens = new Set([
    "button",
    "input",
    "label",
    "title",
    "class",
    "aria",
    "role",
    "data",
    "testid"
  ]);

  const meaningfulTokens = loweredSelector
    .replace(/[^a-z0-9_\- ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => !ignoredTokens.has(token))
    .slice(0, 3);

  if (meaningfulTokens.length === 0) {
    return false;
  }

  return meaningfulTokens.some((token) => lowerHtml.includes(token));
}

function normalizeItems(remainingItems) {
  if (!Array.isArray(remainingItems)) {
    return [];
  }

  return remainingItems
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

function detectBlockedPage(html, url) {
  const lowerHtml = String(html || "").toLowerCase();
  const lowerUrl = String(url || "").toLowerCase();

  const blockedSignals = [
    "just a moment",
    "please enable js and disable any ad blocker",
    "captcha-delivery.com",
    "geo.captcha-delivery.com",
    "page d'erreur",
    "noindex, nofollow",
    "access denied",
    "forbidden"
  ];

  const hasBlockedSignal = blockedSignals.some((signal) => lowerHtml.includes(signal));
  if (!hasBlockedSignal) {
    return null;
  }

  if (lowerUrl.includes("intermarche")) {
    return "Acces bloque par anti-bot/captcha Intermarche (verification JS requise)";
  }

  if (lowerUrl.includes("leclerc")) {
    return "Acces bloque par page de protection Leclerc (DOM Drive indisponible)";
  }

  return "Acces bloque par protection anti-bot/captcha";
}

function detectStoreKey({ url, store }) {
  const fromStore = String(store || "").toLowerCase();
  if (fromStore.includes("leclerc")) return STORE_KEYS.LECLERC;
  if (fromStore.includes("carrefour")) return STORE_KEYS.CARREFOUR;
  if (fromStore.includes("intermarche")) return STORE_KEYS.INTERMARCHE;

  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.includes("leclerc")) return STORE_KEYS.LECLERC;
  if (lowerUrl.includes("carrefour")) return STORE_KEYS.CARREFOUR;
  if (lowerUrl.includes("intermarche")) return STORE_KEYS.INTERMARCHE;

  return STORE_KEYS.DEFAULT;
}

function detectStoreSelectionPage(html) {
  const safeHtml = String(html || "");
  const visibleStoreInput = hasVisibleHtmlMatch(safeHtml, [
    /<input[^>]*id=["']wpad-recherche-magasin-input["'][^>]*>/gi,
    /<input[^>]*placeholder=["'][^"']*(?:ou\s+souhaitez-vous\s+r[eé]cup[eé]rer\s+vos\s+courses|code\s+postal|ville)[^"']*["'][^>]*>/gi,
    /<input[^>]*aria-label=["'][^"']*(?:code\s+postal|magasin|r[eé]cup[eé]rer\s+vos\s+courses)[^"']*["'][^>]*>/gi
  ]);

  const visibleAnnuairePopin = hasVisibleHtmlMatch(safeHtml, [
    /<div[^>]*id=["']ctl00_WctlWCTD224_PopinManager1["'][^>]*>/gi,
    /<div[^>]*class=["'][^"']*divWCTD224_PopinManager[^"']*["'][^>]*>/gi,
    /<[^>]+class=["'][^"']*Annuaire__service[^"']*["'][^>]*>/gi
  ]);

  // select_store must only trigger when the store search input OR Annuaire popin is visible.
  return visibleStoreInput || visibleAnnuairePopin;
}

function hasVisibleHtmlMatch(html, patterns) {
  for (const pattern of patterns) {
    const matches = String(html || "").match(pattern) || [];
    for (const match of matches) {
      if (isLikelyVisibleHtmlNode(match)) {
        return true;
      }
    }
  }
  return false;
}

function isLikelyVisibleHtmlNode(nodeHtml) {
  const lower = String(nodeHtml || "").toLowerCase();

  if (lower.includes("display:none") || lower.includes("visibility:hidden")) {
    return false;
  }

  if (/\shidden(?:\s|>|=)/i.test(nodeHtml)) {
    return false;
  }

  if (lower.includes("aria-hidden=\"true\"") || lower.includes("aria-hidden='true'")) {
    return false;
  }

  if (/(?:class|id)=["'][^"']*(?:masquer|hidden|invisible|is-hidden)[^"']*["']/i.test(nodeHtml)) {
    return false;
  }

  return true;
}

function getSelectorsForStore(storeKey) {
  const local = SELECTORS_BY_STORE[storeKey] || SELECTORS_BY_STORE[STORE_KEYS.DEFAULT];
  const base = SELECTORS_BY_STORE[STORE_KEYS.DEFAULT];

  return {
    searchInput: uniqueSelectors([...(local.searchInput || []), ...(base.searchInput || [])]),
    searchSubmit: uniqueSelectors([...(local.searchSubmit || []), ...(base.searchSubmit || [])]),
    productCard: uniqueSelectors([...(local.productCard || []), ...(base.productCard || [])]),
    productName: uniqueSelectors([...(local.productName || []), ...(base.productName || [])]),
    price: uniqueSelectors([...(local.price || []), ...(base.price || [])]),
    pricePerKg: uniqueSelectors([...(local.pricePerKg || []), ...(base.pricePerKg || [])]),
    addToCart: uniqueSelectors([...(local.addToCart || []), ...(base.addToCart || [])]),
    cookieAccept: uniqueSelectors([...(local.cookieAccept || []), ...(base.cookieAccept || [])]),
    geoLocation: uniqueSelectors([...(local.geoLocation || []), ...(base.geoLocation || [])]),
    storeSelection: uniqueSelectors([...(local.storeSelection || []), ...(base.storeSelection || [])]),
    storeSearchInput: uniqueSelectors([...(local.storeSearchInput || []), ...(base.storeSearchInput || [])]),
    storeOption: uniqueSelectors([...(local.storeOption || []), ...(base.storeOption || [])]),
    storeValidate: uniqueSelectors([...(local.storeValidate || []), ...(base.storeValidate || [])]),
    modalClose: uniqueSelectors([...(local.modalClose || []), ...(base.modalClose || [])]),
    cartSignals: uniqueSelectors([...(base.cartSignals || SELECTORS.cartSignals)])
  };
}

function uniqueSelectors(selectors) {
  return Array.from(new Set((selectors || []).filter(Boolean)));
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(String(needle).toLowerCase()));
}

function strictAction(action, selector, value, reason) {
  return {
    action,
    selector: selector || null,
    value: value || null,
    reason: String(reason || "")
  };
}

function actionSearch(selector, value, reason) {
  return strictAction(ACTIONS.SEARCH, selector, value, reason);
}

function actionClick(selector, reason) {
  if (!selector) {
    return actionError("Action click impossible: selector manquant");
  }

  return strictAction(ACTIONS.CLICK, selector, null, reason);
}

function actionAddToCart(selector, reason) {
  if (!selector) {
    return actionError("Action add_to_cart impossible: selector manquant");
  }

  return strictAction(ACTIONS.ADD_TO_CART, selector, null, reason);
}

function actionSelectStore(storeQuery, selectors) {
  return {
    action: ACTIONS.SELECT_STORE,
    type: ACTIONS.SELECT_STORE,
    selector: null,
    value: null,
    reason: "Page de choix du magasin détectée",
    storeQuery: String(storeQuery || "Paris"),
    selectors: {
      searchInput: selectors.storeSearchInput || SELECTORS.storeSearchInput,
      option: selectors.storeOption || SELECTORS.storeOption,
      validate: selectors.storeValidate || SELECTORS.storeValidate
    }
  };
}

function actionScroll(reason) {
  return strictAction(ACTIONS.SCROLL, null, "down", reason);
}

function actionWait(reason) {
  return strictAction(ACTIONS.WAIT, null, "500", reason);
}

function actionDone(reason) {
  return strictAction(ACTIONS.DONE, null, null, reason);
}

function actionError(reason) {
  return strictAction(ACTIONS.ERROR, null, null, reason);
}

function getDebugLogs() {
  return logger.read();
}

/**
 * Selectors used to detect and click the arrow button of the first Leclerc Drive store.
 * Listed from most specific to broadest fallback.
 */
const LECLERC_ARROW_SELECTORS = [
  // Store cards (new iel-* list): clickable blocks in right panel
  "section[class*='iel-flex-row'] > :last-child div[class*='iel-cursor-pointer'][class*='iel-flex-col']",
  // ── New iel-* React component (leclercdrive.fr 2024+) ───────────────────────
  // "Choisir ce Drive" button directly in the store list panel
  "button:has-text('Choisir ce Drive')",
  "button:has-text('Choisir ce drive')",
  // Store items in the flex-row section (map on left, list on right)
  "section[class*='iel-flex-row'] > :last-child li button",
  "section[class*='iel-flex-row'] > :last-child button",
  // Any iel-* button in a store list context
  "[class*='iel-'] button:has-text('Choisir')",
  "[class*='iel-'] button:has-text('Sélectionner')",
  // ── Legacy WPAD system ───────────────────────────────────────────────────────
  ".store-item button[class*='arrow' i]",
  ".store-item div[class*='arrow' i]",
  "[class*='store-item' i] button[class*='arrow' i]",
  "[class*='driveItem' i] button",
  "[class*='drive-item' i] button",
  ".store-item button",
  "[class*='storeCard' i] button",
  "[class*='store-card' i] button"
];

const LECLERC_PRODUCT_SEARCH_SELECTORS = [
  "#inputWRSL301_rechercheTexte",
  "input[name='q']",
  "input[id*='search' i]",
  "input[id*='rechercheTexte' i]",
  "input[placeholder*='recherche' i]",
  "input[placeholder*='produit' i]",
  "input[aria-label*='recherche' i]",
  "section[class*='iel-'] input[type='search']",
  "header input[type='search']",
  "input[type='search']",
  "input[type='text']"
];

const LECLERC_PRODUCT_SUBMIT_SELECTORS = [
  "#inputWRSL301_rechercheBouton",
  "button[type='submit']",
  "button[aria-label*='recherche' i]",
  "button[title*='recherche' i]",
  "button:has-text('Rechercher')",
  "[role='search'] button"
];

const LECLERC_PRODUCT_CARD_SELECTORS = [
  "li.liWCRS310_Product",
  "li[data-vignette]",
  "[data-product-id]",
  "[data-testid*='product' i]",
  "article[class*='product' i]",
  "li[class*='product' i]",
  "div[class*='iel-product' i]",
  "div[class*='iel-card' i]",
  "main article",
  "main li"
];

const LECLERC_EXTRACTION_CARD_SELECTORS = [
  "li.liWCRS310_Product",
  "li[data-vignette]",
  "iel-product-card",
  "iel-card",
  "[class*='iel-product' i]",
  "[class*='iel-card' i]",
  "div[data-product-id]",
  "[data-product-id]",
  "[data-testid*='product-card' i]",
  "[data-testid*='product' i]",
  "article[data-product-id]",
  "article[class*='product' i]",
  "li[class*='product' i]",
  "div[class*='iel-product' i]",
  "div[class*='product-card' i]",
  "div[class*='product' i][data-id]",
  "section [class*='product' i]",
  "main article",
  "main li"
];

const LECLERC_EXTRACTION_DETAIL_HINTS = Object.freeze({
  expandables: [
    "details summary",
    "button:has-text('Description')",
    "button:has-text('Détails')",
    "button:has-text('Details')",
    "button:has-text('Ingrédients')",
    "button:has-text('Ingredients')",
    "button:has-text('Allergènes')",
    "button:has-text('Allergenes')",
    "button:has-text('Valeurs nutritionnelles')",
    "button:has-text('Informations nutritionnelles')",
    "button:has-text('Caractéristiques')",
    "button:has-text('Composition')",
    "button:has-text('En savoir plus')",
    "[role='button'][aria-expanded='false']",
    "button[aria-expanded='false']"
  ]
});

const LECLERC_ADD_TO_CART_SELECTORS = [
  "a.aWCRS310_Add_Produit_Fiche",
  "a.aWCRS310_Add",
  "a[aria-label*='Ajout produit' i]",
  "a:has-text('Ajouter au panier')",
  "button:has-text('Ajouter au panier')",
  "button:has-text('Ajouter 1')",
  "button:has-text('Ajouter')",
  "button[aria-label*='Ajouter' i]",
  "button[aria-label*='panier' i]",
  "button[data-testid*='add' i]",
  "button[class*='add-to-cart' i]",
  "button[class*='panier' i]",
  "button:has-text('+')"
];

const LECLERC_CART_SIGNALS = [
  "[data-testid*='cart' i]",
  "[aria-label*='panier' i]",
  "a[href*='panier' i]",
  "button[aria-label*='panier' i]",
  "[class*='cart' i] [class*='badge' i]"
];

const CARREFOUR_DRIVE_URL = "https://www.carrefour.fr/services/drive";

const CARREFOUR_STORE_SEARCH_SELECTORS = [
  "[role='dialog'] input[name='addressSearch']",
  "input[name='search']",
  "input[placeholder*='Adresse, code postal, magasin' i]",
  "input[type='search']",
  "input[aria-label*='ville' i]",
  "input[aria-label*='magasin' i]",
  "input[placeholder*='ville' i]",
  "input[placeholder*='code postal' i]",
  "input[name*='store' i]",
  "input[data-testid*='store' i]"
];

const CARREFOUR_STORE_CARD_SELECTORS = [
  "[role='dialog'] [data-testid='store-card-drive-type']",
  "[role='dialog'] .store-card__button",
  "[role='dialog'] .store-card",
  "a[href*='/magasins/']",
  "[data-testid*='store-result' i]",
  "[data-testid*='store-item' i]",
  "[data-testid='store-card']",
  "[data-testid*='store-card' i]",
  "[data-testid*='store' i] [data-testid*='card' i]",
  "li[data-testid*='store' i]",
  "article[data-testid*='store' i]",
  "[class*='store-card' i]",
  "[class*='storeCard' i]",
  "[class*='store' i][class*='card' i]"
];

const CARREFOUR_STORE_SELECT_BUTTONS = [
  "button:has-text('Commencer mes courses')",
  "a:has-text('Commencer mes courses')",
  "[data-testid='sub-header-switch__modal'] [data-testid='store-card-drive-type']",
  "[role='dialog'] [data-testid='store-card-drive-type']",
  "button:has-text('Choisir ce drive')",
  "a:has-text('Voir la fiche')",
  "a[href*='/magasins/']",
  "button:has-text('Commencer mes courses')",
  "a:has-text('Commencer mes courses')",
  "button:has-text('Drive')",
  "button:has-text('Choisir ce magasin')",
  "button:has-text('Choisir')",
  "button:has-text('Sélectionner')",
  "button:has-text('Selectionner')",
  "button:has-text('Continuer')",
  "button[data-testid*='select' i]",
  "button[data-testid*='choose' i]"
];

const CARREFOUR_SELECTED_STORE_SIGNALS = [
  "[data-testid*='store-selected' i]",
  "[data-testid*='selected-store' i]",
  "[data-testid*='store-banner' i]",
  "[class*='selected-store' i]",
  "[class*='store-selected' i]"
];

const CARREFOUR_SEARCH_INPUT_SELECTORS = [
  "input[type='search']",
  "input[name='q']",
  "#vendor-search-handler",
  "input[data-testid*='search' i]",
  "input[aria-label*='rechercher' i]",
  "input[placeholder*='pain' i]",
  "input[placeholder*='produit' i]"
];

const CARREFOUR_SEARCH_SUBMIT_SELECTORS = [
  "button[type='submit']",
  "button[data-testid*='search' i]",
  "button[aria-label*='recherche' i]",
  "button[aria-label*='lancer la recherche' i]"
];

const CARREFOUR_PRODUCT_CARD_SELECTORS = [
  ".product-list-card-plp-grid-new",
  ".product-card-vertical-grid-new__container",
  ".product-card-cta",
  "button[aria-label*='Ajouter le produit' i]",
  "[data-testid='product-card']",
  "[data-testid*='product-card' i]",
  "[data-testid*='product' i]",
  "article[data-product-id]",
  "article[class*='product' i]",
  "div.by_wrapper",
  "div.by_content"
];

const CARREFOUR_ADD_TO_CART_SELECTORS = [
  "button[aria-label*='Ajouter le produit' i]",
  "button[label='Acheter']",
  ".buy-cta button",
  ".add-to-cart button",
  "button:has-text('Acheter')",
  "button[data-testid*='add' i]",
  "button[aria-label*='ajouter' i]",
  "button:has-text('Ajouter')",
  "button:has-text('Ajouter au panier')",
  "button[class*='add' i]",
  "button[class*='cart' i]"
];

const CARREFOUR_CART_SIGNALS = [
  "[data-testid='mainbar-item-cart_quantity']",
  "[data-testid='mainbar-item-cart_amount']",
  "[data-testid*='cart-count' i]",
  "[data-testid*='basket-count' i]",
  "[data-testid*='cart' i] [class*='count' i]",
  "a[href*='panier' i]",
  "button[aria-label*='panier' i]",
  "[class*='cart' i] [class*='badge' i]"
];

const INTERMARCHE_DRIVE_URL = "https://www.intermarche.com";

const INTERMARCHE_POPUP_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button:has-text('Tout accepter')",
  "button:has-text('Accepter')",
  "button:has-text('J\'accepte')",
  "button:has-text('Continuer sans accepter')",
  "button:has-text('Fermer')",
  "button[aria-label*='fermer' i]",
  "button[aria-label*='close' i]",
  "button:has-text('Plus tard')"
];

const INTERMARCHE_STORE_SEARCH_SELECTORS = [
  "input[name='search']",
  "input[name='city']",
  "input[data-testid*='store-search' i]",
  "input[data-testid*='store' i]",
  "input[placeholder*='ville' i]",
  "input[placeholder*='code postal' i]",
  "input[placeholder*='magasin' i]",
  "input[aria-label*='ville' i]",
  "input[aria-label*='magasin' i]",
  "input[type='search']"
];

const INTERMARCHE_STORE_CARD_SELECTORS = [
  "[data-testid='store-card']",
  "[data-testid*='store-card' i]",
  "[data-testid*='store-result' i]",
  "[data-testid*='shop-card' i]",
  "article[class*='store' i]",
  "li[class*='store' i]",
  "div[class*='store-card' i]",
  "div[class*='storeCard' i]",
  "[class*='shop-card' i]",
  "[role='option']"
];

const INTERMARCHE_STORE_BUTTON_SELECTORS = [
  "button:has-text('Choisir ce magasin')",
  "button:has-text('Choisir ce drive')",
  "button:has-text('Choisir ce Drive')",
  "button:has-text('Choisir')",
  "button:has-text('Sélectionner')",
  "button:has-text('Selectionner')",
  "button:has-text('Continuer')",
  "a:has-text('Choisir')",
  "a:has-text('Commencer mes courses')",
  "button[data-testid*='select' i]",
  "button[data-testid*='choose' i]"
];

const INTERMARCHE_STORE_ENTRY_SELECTORS = [
  "button:has-text('Choisir mon magasin')",
  "a:has-text('Choisir mon magasin')",
  "button:has-text('Choisir votre magasin')",
  "a:has-text('Choisir votre magasin')",
  "button:has-text('Mon magasin')",
  "a:has-text('Mon magasin')",
  "button[data-testid*='store' i]",
  "a[data-testid*='store' i]"
];

const INTERMARCHE_COURSES_ENTRY_SELECTORS = [
  "a:has-text('Courses en ligne')",
  "button:has-text('Courses en ligne')",
  "a[href*='course-en-ligne' i]",
  "a[href*='courses-en-ligne' i]",
  "a[href*='services/drive' i]",
  "a[title*='Courses en ligne' i]"
];

const INTERMARCHE_SELECTED_STORE_SIGNALS = [
  "[data-testid*='selected-store' i]",
  "[data-testid*='store-selected' i]",
  "[data-testid*='current-store' i]",
  "[class*='selected-store' i]",
  "[class*='current-store' i]",
  "button:has-text('Changer de magasin')",
  "a:has-text('Changer de magasin')",
  "button:has-text('Mon magasin')"
];

const INTERMARCHE_SEARCH_INPUT_SELECTORS = [
  "input[name='search']",
  "input[name='q']",
  "#search",
  "#search-input",
  "input[id*='search' i]",
  "input[data-testid*='search' i]",
  "input[placeholder*='recherche' i]",
  "input[placeholder*='produit' i]",
  "input[placeholder*='courses' i]",
  "input[aria-label*='recherche' i]",
  "input[aria-label*='produit' i]",
  "header input[type='text']",
  "header input[type='search']",
  "main input[type='text']",
  "input[type='search']"
];

const INTERMARCHE_SEARCH_SUBMIT_SELECTORS = [
  "button[type='submit']",
  "button[data-testid*='search' i]",
  "button[aria-label*='recherche' i]",
  "button:has-text('Rechercher')"
];

const INTERMARCHE_PRODUCT_CARD_SELECTORS = [
  "[data-testid='product-card']",
  "[data-testid*='product-card' i]",
  "[data-testid*='product' i]",
  "article[data-testid*='product' i]",
  "article[class*='product' i]",
  "li[class*='product' i]",
  "div[class*='product-card' i]",
  "div[class*='productCard' i]",
  "div[class*='product' i][data-id]",
  "main article",
  "main li",
  "section article",
  "section li"
];

const INTERMARCHE_ADD_TO_CART_SELECTORS = [
  "button[data-testid*='add' i]",
  "button[aria-label*='ajouter' i]",
  "button[aria-label*='panier' i]",
  "button:has-text('Ajouter au panier')",
  "button:has-text('Ajouter')",
  "button:has-text('Acheter')",
  "button[class*='add' i]",
  "button[class*='cart' i]"
];

const INTERMARCHE_CART_SIGNALS = [
  "div[class*='product' i][data-id]",
  "main article",
  "main li",
  "section article",
  "section li"
];

const SUPERU_ADD_TO_CART_SELECTORS = [
  "button[data-testid*='add' i]",
  "button[aria-label*='ajouter' i]",
  "button[aria-label*='panier' i]",
  "button:has-text('Ajouter au panier')",
  "button:has-text('Ajouter')",
  "button:has-text('Acheter')",
  "button[class*='add' i]",
  "button[class*='cart' i]"
];

const SUPERU_CART_SIGNALS = [
  "[data-testid*='cart-count' i]",
  "[data-testid*='basket-count' i]",
  "[data-testid*='cart' i] [class*='count' i]",
  "[data-testid*='cart' i]",
  "a[href*='panier' i]",
  "button[aria-label*='panier' i]",
  "[class*='cart' i] [class*='badge' i]",
  "[class*='panier' i] [class*='badge' i]"
];

const SUPERU_COOKIE_ACCEPT_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button:has-text('Tout accepter')",
  "button:has-text('Accepter')",
  "button:has-text('J\\'accepte')",
  "button:has-text('Continuer')",
  "button[aria-label*='accepter' i]"
];

async function dismissSuperUOverlays(page) {
    // Dismiss geolocation popup
    for (const selector of SUPERU_GEOLOCATION_SELECTORS) {
      try {
        const element = page.locator(selector).first();
        if (await element.count() > 0 && await element.isVisible({ timeout: 120 })) {
          await element.click({ timeout: 1200 });
          await page.waitForTimeout(180);
          break;
        }
      } catch (_) {
        // best effort only
      }
    }

    // Dismiss cookies
    for (const selector of SUPERU_COOKIE_ACCEPT_SELECTORS) {
      try {
        const element = page.locator(selector).first();
        if (await element.count() > 0 && await element.isVisible({ timeout: 120 })) {
          await element.click({ timeout: 1200 });
          await page.waitForTimeout(180);
          break;
        }
      } catch (_) {
        // best effort only
      }
    }
  }

  for (const selector of INTERMARCHE_POPUP_SELECTORS) {
    try {
      const element = page.locator(selector).first();
      if (await element.count() > 0 && await element.isVisible({ timeout: 120 })) {
        await element.click({ timeout: 1200 });
        await page.waitForTimeout(180);
      }
    } catch (_) {
      // best effort only
    }
  }

  await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const wantsClick = [
      "accepter",
      "tout accepter",
      "j'accepte",
      "fermer",
      "plus tard",
      "continuer"
    ];

    const dispatch = (node) => {
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
      } catch (_) {
        // ignore
      }
    };

    const inView = (node) => {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };

    const candidates = Array.from(document.querySelectorAll("[role='dialog'] button, .modal button, .popup button, button"));
    for (const button of candidates) {
      if (!(button instanceof HTMLElement)) continue;
      if (!inView(button)) continue;
      const text = clean(button.textContent || button.getAttribute("aria-label") || button.getAttribute("title") || "");
      if (!text) continue;
      if (wantsClick.some((token) => text.includes(token))) {
        dispatch(button);
      }
    }
  }).catch(() => {});
}
/**
 * Click the arrow of the first Leclerc Drive store in the list to open the detail panel,
 * then verify the panel is open by waiting for "Choisir ce Drive".
 *
 * This function is designed to run inside a Playwright context where `page` is a live
 * Page object connected to Chrome via CDP.
 *
 * @param {import('playwright').Page} page - Active Playwright page.
 * @param {object} [options]
 * @param {number} [options.storeListTimeout=20000] - Max ms to wait for the store list.
 * @param {number} [options.panelTimeout=8000]      - Max ms to wait for the detail panel.
 * @returns {Promise<{success: boolean, selector: string|null, error: string|null}>}
 */
async function selectLeclercDriveArrow(page, options = {}) {
  const storeListTimeout = Number(options.storeListTimeout) || 20000;
  const panelTimeout = Number(options.panelTimeout) || 8000;

  // Build a combined CSS selector covering all arrow candidates.
  const combinedListSelector = LECLERC_ARROW_SELECTORS.join(", ");

  // ── Step 1 : wait for at least one arrow button to appear ───────────────────
  logger.push("selectLeclercDriveArrow:waiting_for_store_list");
  try {
    await page.waitForSelector(combinedListSelector, { timeout: storeListTimeout });
    console.log("✅ Liste des magasins chargée");
    logger.push("selectLeclercDriveArrow:store_list_ready");
  } catch (err) {
    const msg = `Aucun sélecteur de flèche trouvé après ${storeListTimeout}ms : ${err.message}`;
    logger.push(`selectLeclercDriveArrow:store_list_timeout ${msg}`);
    return { success: false, selector: null, error: msg };
  }

  // ── Step 2 : identify the best matching target in priority order ────────────
  let resolvedSelector = null;
  let clickMode = "selector";

  // Prefer actual store cards containing a Drive service (and avoid "Ouverture prochaine").
  try {
    const driveCards = page.locator(
      "section[class*='iel-flex-row'] > :last-child div[class*='iel-cursor-pointer'][class*='iel-flex-col']"
    );
    const count = await driveCards.count();
    for (let i = 0; i < count; i++) {
      const txt = ((await driveCards.nth(i).textContent()) || "").replace(/\s+/g, " ").trim();
      if (/drive/i.test(txt) && !/ouverture prochaine/i.test(txt)) {
        resolvedSelector = `drive-card[nth=${i}]`;
        clickMode = "drive-card";
        console.log(`🔍 Carte Drive détectée : ${txt.slice(0, 120)}`);
        logger.push(`selectLeclercDriveArrow:drive_card_detected index=${i}`);
        break;
      }
    }
  } catch (_) {
    // fallback to selector scan below
  }

  // Fallback: keep legacy selector scan
  for (const candidate of LECLERC_ARROW_SELECTORS) {
    if (resolvedSelector) break;
    try {
      const el = await page.$(candidate);
      if (el) {
        resolvedSelector = candidate;
        console.log(`🔍 Flèche détectée avec le sélecteur : ${candidate}`);
        logger.push(`selectLeclercDriveArrow:arrow_detected selector=${candidate}`);
        break;
      }
    } catch (_) {
      // selector unsupported by engine – try next
    }
  }

  if (!resolvedSelector) {
    const msg = "Aucune flèche de magasin détectée dans le DOM";
    logger.push(`selectLeclercDriveArrow:no_arrow_found`);
    return { success: false, selector: null, error: msg };
  }

  // ── Step 3 : click the selected target ──────────────────────────────────────
  const firstArrowSelector = resolvedSelector;
  try {
    if (clickMode === "drive-card") {
      const idx = Number((firstArrowSelector.match(/nth=(\d+)/) || [])[1] || 0);
      const card = page.locator(
        "section[class*='iel-flex-row'] > :last-child div[class*='iel-cursor-pointer'][class*='iel-flex-col']"
      ).nth(idx);
      await card.click({ timeout: 5000 });
    } else {
      await page.click(firstArrowSelector);
    }
    console.log(`🖱️  Clic effectué sur : ${firstArrowSelector}`);
    logger.push(`selectLeclercDriveArrow:click_done selector=${firstArrowSelector}`);
  } catch (clickErr) {
    // ── Step 3b : fallback – force click via JS evaluate ──────────────────────
    logger.push(`selectLeclercDriveArrow:click_failed fallback_js_click ${clickErr.message}`);
    try {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`Élément introuvable pour : ${sel}`);
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      }, firstArrowSelector);
      console.log(`🖱️  Clic JS effectué sur : ${firstArrowSelector}`);
      logger.push(`selectLeclercDriveArrow:js_click_done selector=${firstArrowSelector}`);
    } catch (jsErr) {
      const msg = `Clic JS également échoué : ${jsErr.message}`;
      logger.push(`selectLeclercDriveArrow:js_click_failed ${msg}`);
      return { success: false, selector: firstArrowSelector, error: msg };
    }
  }

  // ── Step 4 : verify the detail panel opened ──────────────────────────────────
  const chooseDriveSelector = [
    "button:has-text('Choisir ce Drive')",
    "button:has-text('Choisir ce drive')",
    "button:has-text('Continuer')"
  ].join(", ");
  try {
    await page.waitForSelector(chooseDriveSelector, { timeout: panelTimeout });
    console.log("✅ Flèche cliquée et panneau ouvert");
    logger.push("selectLeclercDriveArrow:panel_open");
    return { success: true, selector: firstArrowSelector, error: null };
  } catch (panelErr) {
    // Panel may have a slightly different text – try a broader fallback
    try {
      await page.waitForFunction(() => {
        const body = (document.body?.innerText || "").toLowerCase();
        return (
          body.includes("commencer mes courses") ||
          body.includes("je peux retirer ma commande") ||
          body.includes("votre magasin") ||
          body.includes("mon magasin")
        );
      }, { timeout: 2500 });
      console.log("✅ Flèche cliquée – panneau détecté via contenu textuel");
      logger.push("selectLeclercDriveArrow:panel_open_fallback");
      return { success: true, selector: firstArrowSelector, error: null };
    } catch (_) {
      const msg = `Panneau de détail non détecté après ${panelTimeout}ms : ${panelErr.message}`;
      logger.push(`selectLeclercDriveArrow:panel_not_opened ${msg}`);
      return { success: false, selector: firstArrowSelector, error: msg };
    }
  }
}

function uniqueTexts(values) {
  return Array.from(new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean)));
}

async function waitAnySelector(page, selectors, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.count() > 0 && await loc.isVisible({ timeout: 250 })) {
          return sel;
        }
      } catch (_) {
        // keep trying next selector
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function safeClick(page, selectors, label = "element") {
  const targetSelector = await waitAnySelector(page, selectors, 3000);
  if (!targetSelector) {
    return false;
  }

  try {
    await page.click(targetSelector, { timeout: 4000 });
    logger.push(`safeClick:clicked label=${label} selector=${targetSelector}`);
    return true;
  } catch (_) {
    return false;
  }
}

async function waitForProductComponents(page, selectors, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const first = await waitAnySelector(page, selectors, 1200);
    if (first) {
      return first;
    }

    try {
      const hasIel = await page.evaluate(() => {
        return Boolean(
          document.querySelector("iel-product-card")
          || document.querySelector("iel-card")
          || document.querySelector("[data-product-id]")
        );
      });
      if (hasIel) {
        return "iel-product-card";
      }
    } catch (_) {
      // keep waiting while React/IEL components mount
    }

    await page.waitForTimeout(250);
  }

  return null;
}

function parsePriceFromText(text) {
  const source = String(text || "");
  const compact = source.replace(/\s+/g, " ").trim();
  const splitMatch = compact.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
  if (splitMatch) {
    const value = Number(`${splitMatch[1]}.${splitMatch[2]}`);
    return Number.isFinite(value) ? value : null;
  }
  const match = compact.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i) || compact.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
  if (!match) return null;
  const value = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseUnitPriceFromText(text) {
  const source = String(text || "");
  const compact = source.replace(/\s+/g, " ").trim();
  const splitMatch = compact.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{1,4})\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
  if (splitMatch) {
    const value = Number(`${splitMatch[1]}.${splitMatch[2]}`);
    return Number.isFinite(value) ? value : null;
  }
  const match = compact.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
  if (!match) return null;
  const value = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseFormatFromText(text) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const match = source.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i);
  return match ? String(match[1]).replace(/\s+/g, "") : null;
}

function buildProductAliases(product) {
  const safe = product || {};
  return {
    ...safe,
    price: safe.unitPrice ?? null,
    pricePerKg: safe.pricePerUnit ?? null,
    pricePerLitre: safe.pricePerUnit ?? null,
    format: safe.formatQuantity ?? null,
    quantity: safe.formatQuantity ?? null,
    id: safe.internalId ?? null,
    url: safe.productUrl ?? null,
    image: safe.imageUrl ?? null
  };
}

function buildDetailAliases(product) {
  const safe = buildProductAliases(product);
  return {
    ...safe,
    allergenes: safe.allergens ?? null,
    ingredientsText: safe.ingredients ?? null,
    nutritionValues: safe.nutrition ?? null,
    nutritionalValues: safe.nutrition ?? null
  };
}

async function extractProductList(page, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 20);
  const timeout = Math.max(3000, Number(options.timeout) || 15000);
  const extraCardSelectors = Array.isArray(options.extraCardSelectors) ? options.extraCardSelectors : [];
  const initialSelectors = uniqueTexts([
    ...extraCardSelectors,
    ...LECLERC_EXTRACTION_CARD_SELECTORS
  ]);

  console.log("📄 Extraction produit: liste");
  logger.push(`extractProductList:start limit=${limit}`);

  let selectors = initialSelectors.slice();
  let lastCause = "unknown";

  for (let attempt = 1; attempt <= 3; attempt++) {
    const readySelector = await waitForProductComponents(page, selectors, timeout);
    if (!readySelector) {
      lastCause = "product components not rendered";
      logger.push(`extractProductList:attempt=${attempt} cause=${lastCause}`);
      try {
        await page.mouse.wheel(0, 1200);
      } catch (_) {
        // ignore scroll failures
      }
      selectors = uniqueTexts([
        ...selectors,
        "div[class*='product' i]",
        "section article",
        "section li"
      ]);
      continue;
    }

    logger.push(`extractProductList:attempt=${attempt} selector=${readySelector}`);

    const legacyLeclercCards = await page.evaluate(({ maxItems }) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const parsePrice = (whole, decimal, fallbackText) => {
        const safeWhole = clean(whole).replace(/[^\d]/g, "");
        const safeDecimal = clean(decimal).replace(/[^\d]/g, "");
        if (safeWhole && safeDecimal) {
          const parsed = Number(`${safeWhole}.${safeDecimal}`);
          if (Number.isFinite(parsed)) return parsed;
        }

        const source = clean(fallbackText);
        const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
        if (splitMatch) {
          const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
          if (Number.isFinite(parsed)) return parsed;
        }

        const match = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i);
        if (!match) return null;
        const parsed = Number(String(match[1]).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const parseFormat = (value) => {
        const source = clean(value);
        const match = source.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i);
        return match ? clean(match[1]).replace(/\s+/g, "") : null;
      };

      const cards = Array.from(document.querySelectorAll("li.liWCRS310_Product")).filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      });

      return cards.slice(0, Math.max(maxItems * 2, 20)).map((card, index) => {
        const text = clean(card.innerText || card.textContent);
        const name = clean(
          card.querySelector(".pWCRS310_Libelle, .aWCRS310_Product, [class*='Libelle' i], [class*='Title' i]")?.textContent
          || card.querySelector("img")?.getAttribute("alt")
          || text.split(/Ajouter au panier|Voir le rayon/i)[0]
        );

        const priceWhole = card.querySelector(".pWCRS310_PrixUnitairePartieEntiere, [class*='PrixUnitairePartieEntiere' i]")?.textContent || "";
        const priceDecimal = card.querySelector(".pWCRS310_PrixUnitairePartieDecimale, [class*='PrixUnitairePartieDecimale' i]")?.textContent || "";
        const unitPriceText = clean(
          card.querySelector(".pWCRS310_PrixUniteMesure, [class*='PrixUniteMesure' i]")?.textContent || ""
        );
        const promo = clean(
          card.querySelector("[class*='Promo' i], [class*='Remise' i], [class*='Badge' i]")?.textContent
          || (text.match(/\b(?:\d+\+\d+\s+offert|promo|promotion|offre|\-\d+\s*%|\d+\s*%\s*offert)\b/i)?.[0] || "")
        ) || null;

        const detailLink = card.querySelector("a.aWCRS310_Product[href], a[href]");
        const image = card.querySelector("img");
        const availability = clean(card.getAttribute("data-vignette") || "") || (/indisponible|rupture|non disponible/i.test(text) ? "indisponible" : "disponible");

        return {
          name: name || null,
          unitPrice: parsePrice(priceWhole, priceDecimal, text),
          pricePerUnit: parsePrice(null, null, unitPriceText),
          availability,
          promo,
          formatQuantity: parseFormat(name || text),
          internalId: clean(card.getAttribute("id") || card.getAttribute("data-id") || `legacy-${index + 1}`),
          productUrl: detailLink?.href || null,
          imageUrl: image?.currentSrc || image?.getAttribute("src") || image?.getAttribute("data-src") || null,
          category: null
        };
      }).filter((product) => product.name && Number.isFinite(product.unitPrice) && product.unitPrice > 0).slice(0, maxItems);
    }, { maxItems: limit });

    if (legacyLeclercCards.length > 0) {
      const normalized = legacyLeclercCards.map((product, index) => {
        const result = buildProductAliases({
          name: product.name || `Produit ${index + 1}`,
          unitPrice: Number.isFinite(product.unitPrice) ? Number(product.unitPrice) : null,
          pricePerUnit: Number.isFinite(product.pricePerUnit) ? Number(product.pricePerUnit) : null,
          availability: product.availability || "inconnue",
          promo: product.promo || null,
          formatQuantity: product.formatQuantity || parseFormatFromText(product.name),
          internalId: product.internalId || `fallback-${index + 1}`,
          productUrl: product.productUrl || null,
          imageUrl: product.imageUrl || null,
          category: product.category || null
        });

        console.log(`💰 Prix détecté: ${result.name} -> ${result.unitPrice}€`);
        if (result.promo) {
          console.log(`🏷️ Promo détectée: ${result.name} -> ${result.promo}`);
        }

        return result;
      });

      logger.push(`extractProductList:success legacy_count=${normalized.length}`);
      return normalized;
    }

    const extracted = await page.evaluate(({ cardSelectors, maxItems }) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

      const rootsFor = (node) => {
        const roots = [];
        if (node) roots.push(node);
        if (node && node.shadowRoot) roots.push(node.shadowRoot);
        return roots;
      };

      const queryFirst = (node, selectors) => {
        for (const root of rootsFor(node)) {
          for (const selector of selectors) {
            try {
              const found = root.querySelector(selector);
              if (found) return found;
            } catch (_) {
              // ignore invalid selector for this root
            }
          }
        }
        return null;
      };

      const queryAll = (node, selectors) => {
        const results = [];
        const seen = new Set();
        for (const root of rootsFor(node)) {
          for (const selector of selectors) {
            try {
              for (const found of root.querySelectorAll(selector)) {
                if (seen.has(found)) continue;
                seen.add(found);
                results.push(found);
              }
            } catch (_) {
              // ignore invalid selector for this root
            }
          }
        }
        return results;
      };

      const readAttr = (node, names) => {
        if (!node) return null;
        for (const name of names) {
          const value = clean(node.getAttribute?.(name));
          if (value) return value;
        }
        return null;
      };

      const parsePrice = (value) => {
        const source = clean(value);
        const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
        if (splitMatch) {
          const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
          return Number.isFinite(parsed) ? parsed : null;
        }
        const match = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i) || source.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
        if (!match) return null;
        const parsed = Number(String(match[1]).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const parseUnitPrice = (value) => {
        const source = clean(value);
        const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{1,4})\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
        if (splitMatch) {
          const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
          return Number.isFinite(parsed) ? parsed : null;
        }
        const match = source.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
        if (!match) return null;
        const parsed = Number(String(match[1]).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const parseFormat = (value) => {
        const source = clean(value);
        const match = source.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i);
        return match ? clean(match[1]).replace(/\s+/g, "") : null;
      };

      const parseHrefId = (href) => {
        const source = String(href || "");
        const patterns = [
          /[?&](?:product(?:Id)?|id|ref)=([^&#]+)/i,
          /\/produit\/([^/?#]+)/i,
          /\/p\/([^/?#]+)/i
        ];
        for (const pattern of patterns) {
          const match = source.match(pattern);
          if (match && clean(match[1])) return clean(match[1]);
        }
        return null;
      };

      const nearestCategory = (node) => {
        let current = node;
        while (current) {
          const scoped = clean(
            current.querySelector?.("h2, h3, [data-testid*='category' i], [class*='category' i], [class*='rayon' i]")?.textContent
          );
          if (scoped && scoped.length <= 80 && !/ajouter|panier|€|promo/i.test(scoped)) {
            return scoped;
          }
          current = current.parentElement;
        }
        return null;
      };

      const nodes = [];
      const seen = new Set();
      for (const selector of cardSelectors) {
        const list = Array.from(document.querySelectorAll(selector));
        for (const node of list) {
          if (!(node instanceof HTMLElement)) continue;
          if (seen.has(node)) continue;
          seen.add(node);
          nodes.push(node);
        }
      }

      const filteredNodes = nodes.filter((node) => {
        return !nodes.some((other) => other !== node && other.contains(node));
      });

      const visibleCards = filteredNodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) return false;
        const text = clean(node.innerText || node.textContent);
        if (!text) return false;
        if (/voir le rayon|nos rayons|ajouter à mes listes|mes listes|bons plans|promotions?$/i.test(text)) return false;

        const hasPrice = /(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i.test(text) || /(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i.test(text);
        const hasAdd = /ajouter|panier/i.test(text);
        const hasProductAnchor = Boolean(queryFirst(node, ["a[href*='produit' i]", "a[href*='product' i]", "a[href*='/p/' i]", "a[href*='/fiche/' i]"]));
        const hasInternalId = Boolean(readAttr(node, ["data-product-id", "data-id", "data-uid", "data-sku", "data-ref"]));
        return hasPrice || (hasAdd && (hasProductAnchor || hasInternalId));
      }).slice(0, Math.max(maxItems * 3, 30));

      const products = [];
      const uniqueByIdOrName = new Set();

      for (const card of visibleCards) {
        const text = clean(card.innerText || card.textContent);
        if (!text) continue;

        const nameNode = queryFirst(card, [
          ".pWCRS310_Libelle",
          ".pWCRS310_Title",
          "[class*='Libelle' i]",
          "[class*='Titre' i]",
          "[data-testid*='product-label' i]",
          "[data-testid*='name' i]",
          "[class*='productLabel' i]",
          "[class*='product-name' i]",
          "[class*='name' i]",
          "h1",
          "h2",
          "h3",
          "a[title]",
          "img[alt]"
        ]);
        let name = clean(nameNode?.textContent || nameNode?.getAttribute?.("title") || nameNode?.getAttribute?.("alt") || "");
        if (!name) {
          const beforePrice = text.split(/\d{1,4}(?:[.,]\d{1,2})\s*€/i)[0] || "";
          name = clean(beforePrice).slice(0, 160);
        }

        const priceNode = queryFirst(card, [
          ".pWCRS310_PrixUnitaire",
          ".pWCRS310_PrixUnitairePartieEntiere",
          "[class*='PrixUnitaire' i]",
          "[data-testid*='sale-price' i]",
          "[data-testid*='price' i]",
          "[class*='price' i]",
          "[class*='tarif' i]",
          "[class*='amount' i]"
        ]);
        const priceWhole = clean(queryFirst(card, [".pWCRS310_PrixUnitairePartieEntiere", "[class*='PrixUnitairePartieEntiere' i]"])?.textContent || "");
        const priceDecimal = clean(queryFirst(card, [".pWCRS310_PrixUnitairePartieDecimale", "[class*='PrixUnitairePartieDecimale' i]"])?.textContent || "");
        const stitchedPriceText = priceWhole && priceDecimal ? `${priceWhole} € ${priceDecimal}` : "";
        const price = parsePrice(stitchedPriceText || priceNode?.textContent || text);
        const unitPriceNode = queryFirst(card, [
          ".pWCRS310_PrixUniteMesure",
          "[class*='PrixUniteMesure' i]",
          "[data-testid*='price-per' i]",
          "[class*='price-per' i]",
          "[class*='unit' i]",
          "[class*='kilo' i]",
          "[class*='litre' i]",
          "[class*='kg' i]"
        ]);
        const pricePerUnit = parseUnitPrice(unitPriceNode?.textContent || text);

        const promoNode = queryFirst(card, [
          "[class*='Promo' i]",
          "[class*='Remise' i]",
          "[class*='promo' i]",
          "[class*='badge' i]",
          "[data-testid*='promo' i]",
          "[class*='discount' i]"
        ]);
        const promo = clean(promoNode?.textContent || (text.match(/(?:promo|promotion|offre|\-\d+\s*%|\d+\s*%\s*offert)/i)?.[0] || "")) || null;

        const availabilityText = text.match(/indisponible|rupture|non disponible/i)?.[0] || "";
        const available = availabilityText.length === 0;
        const availability = available ? "disponible" : clean(availabilityText);

        const formatNode = queryFirst(card, [
          "[class*='format' i]",
          "[class*='quantity' i]",
          "[class*='contenance' i]",
          "[class*='conditionnement' i]"
        ]);
        const formatQuantity = parseFormat(formatNode?.textContent || text);

        const detailLinkNode = queryFirst(card, [
          "a[href*='produit' i]",
          "a[href*='fiche' i]",
          "a[href*='detail' i]",
          "a[href*='article' i]",
          "a[href]"
        ]) || card.closest("a[href]");
        const addLinkNode = queryFirst(card, [".aWCRS310_Add", "a[aria-label*='Ajout produit' i]", "a:has-text('Ajouter au panier')"]);
        const productUrl = detailLinkNode?.href || addLinkNode?.href || null;

        const id = readAttr(card, ["data-product-id", "data-id", "data-uid", "data-sku", "data-ref"])
          || readAttr(detailLinkNode, ["data-product-id", "data-id", "data-uid", "data-sku", "data-ref"])
          || parseHrefId(productUrl)
          || card.getAttribute("id")
          || null;

        const imgNode = queryFirst(card, ["img", "source[srcset]"]);
        let imageUrl = null;
        if (imgNode) {
          imageUrl = imgNode.currentSrc || imgNode.getAttribute("src") || imgNode.getAttribute("data-src") || null;
          if (!imageUrl) {
            const srcSet = imgNode.getAttribute("srcset");
            if (srcSet) {
              imageUrl = clean(srcSet.split(",")[0].split(" ")[0]);
            }
          }
        }

        const category = card.getAttribute("data-category")
          || readAttr(card, ["data-rayon", "data-univers", "data-department"])
          || clean(queryFirst(card, ["[class*='category' i]", "[data-testid*='category' i]", "[class*='rayon' i]"])?.textContent || "")
          || nearestCategory(card)
          || null;

        const rejectedName = /voir le rayon|nos rayons|ajouter à mes listes|mes listes|bons plans|promotions?$/i.test(name);
        if (rejectedName) continue;

        const hasStrongProductSignal = Boolean(id)
          || /\/produit|\/product|\/p\//i.test(String(productUrl || ""));

        if (!hasStrongProductSignal && !/ajouter|panier/i.test(text)) continue;
        if (!name || !price || price <= 0) continue;

        const key = `${id || ""}|${name.toLowerCase()}`;
        if (uniqueByIdOrName.has(key)) continue;
        uniqueByIdOrName.add(key);

        products.push({
          name: name || null,
          unitPrice: price,
          pricePerUnit,
          availability,
          promo,
          formatQuantity,
          internalId: id,
          productUrl,
          imageUrl,
          category
        });
      }

      return products.slice(0, maxItems);
    }, { cardSelectors: selectors, maxItems: limit });

    if (extracted.length === 0) {
      lastCause = "no visible product cards parsed";
      logger.push(`extractProductList:attempt=${attempt} cause=${lastCause}`);
      try {
        await page.mouse.wheel(0, 1500);
      } catch (_) {
        // ignore scroll failures
      }
      selectors = uniqueTexts([
        ...selectors,
        "[class*='grid'] article",
        "[class*='product-list'] li"
      ]);
      continue;
    }

    const normalized = extracted.map((product, index) => {
      const unitPrice = Number.isFinite(product.unitPrice) ? Number(product.unitPrice) : null;
      const pricePerUnit = Number.isFinite(product.pricePerUnit) ? Number(product.pricePerUnit) : null;

      const result = buildProductAliases({
        name: product.name || `Produit ${index + 1}`,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
        pricePerUnit: Number.isFinite(pricePerUnit) ? pricePerUnit : null,
        availability: product.availability || "inconnue",
        promo: product.promo || null,
        formatQuantity: product.formatQuantity || parseFormatFromText(product.name),
        internalId: product.internalId || `fallback-${index + 1}`,
        productUrl: product.productUrl || null,
        imageUrl: product.imageUrl || null,
        category: product.category || null
      });

      if (result.unitPrice !== null) {
        console.log(`💰 Prix détecté: ${result.name} -> ${result.unitPrice}€`);
      }
      if (result.promo) {
        console.log(`🏷️ Promo détectée: ${result.name} -> ${result.promo}`);
      }

      return result;
    });

    logger.push(`extractProductList:success count=${normalized.length}`);
    return normalized;
  }

  logger.push(`extractProductList:failed cause=${lastCause}`);
  return [];
}

async function extractProductDetails(page, options = {}) {
  const timeout = Math.max(3000, Number(options.timeout) || 15000);
  const expandables = uniqueTexts([
    ...LECLERC_EXTRACTION_DETAIL_HINTS.expandables,
    ...((Array.isArray(options.extraExpandableSelectors) ? options.extraExpandableSelectors : []))
  ]);

  console.log("📄 Extraction produit: fiche détail");
  logger.push("extractProductDetails:start");

  // Expand foldable sections to expose ingredients/allergens/nutrition.
  for (const selector of expandables) {
    try {
      const loc = page.locator(selector).first();
      if (await loc.count() > 0 && await loc.isVisible({ timeout: 200 })) {
        await loc.click({ timeout: 1200 });
        await page.waitForTimeout(120);
      }
    } catch (_) {
      // best effort only
    }
  }

  await page.waitForTimeout(250);
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});

  const details = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const clickExpandables = () => {
      const triggers = Array.from(document.querySelectorAll("details summary, button, [role='button'], [aria-expanded]")).filter((node) => {
        const text = clean(node.textContent).toLowerCase();
        const collapsed = String(node.getAttribute?.("aria-expanded") || "").toLowerCase() === "false";
        return collapsed || /description|détails|details|ingr[eé]dients?|allerg[eè]nes?|nutrition|caract[eé]ristiques|composition|en savoir plus/.test(text);
      });

      for (const trigger of triggers) {
        try {
          trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        } catch (_) {
          // best effort only
        }
      }
    };

    clickExpandables();

    const parsePrice = (value) => {
      const source = clean(value);
      const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
      if (splitMatch) {
        const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const match = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i) || source.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
      if (!match) return null;
      const parsed = Number(String(match[1]).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseUnitPrice = (value) => {
      const source = clean(value);
      const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{1,4})\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
      if (splitMatch) {
        const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const match = source.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
      if (!match) return null;
      const parsed = Number(String(match[1]).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const pickSection = (patterns) => {
      const headingCandidates = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, strong, summary, button"));
      const heading = headingCandidates.find((node) => {
        const text = clean(node.textContent).toLowerCase();
        return patterns.some((pattern) => pattern.test(text));
      });
      if (!heading) return null;

      const parent = heading.closest("section, article, div, details") || heading.parentElement;
      return clean(parent?.textContent || heading.textContent || "") || null;
    };

    const pickMetaValue = (patterns) => {
      const candidates = Array.from(document.querySelectorAll("dt, th, strong, span, div, p, li"));
      for (const node of candidates) {
        const label = clean(node.textContent).toLowerCase();
        if (!patterns.some((pattern) => pattern.test(label))) continue;
        const parent = node.closest("tr, dl, li, div, section, article") || node.parentElement;
        const content = clean(parent?.textContent || node.textContent || "");
        if (content) return content;
      }
      return null;
    };

    const parseHrefId = (href) => {
      const source = String(href || "");
      const patterns = [
        /[?&](?:product(?:Id)?|id|ref)=([^&#]+)/i,
        /\/produit\/([^/?#]+)/i,
        /\/p\/([^/?#]+)/i
      ];
      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match && clean(match[1])) return clean(match[1]);
      }
      return null;
    };

    const bodyText = clean(document.body?.innerText || "");
    const name = clean(document.querySelector("h1, h2, [data-testid*='name' i], [class*='name' i], [data-testid*='product-label' i]")?.textContent || document.querySelector("img[alt]")?.getAttribute("alt") || document.title || "");

    const mainNode = document.querySelector("main") || document.body;
    const mainText = clean(mainNode?.textContent || bodyText);

    const availability = /indisponible|rupture|non disponible/i.test(mainText)
      ? (mainText.match(/indisponible|rupture|non disponible/i)?.[0] || "indisponible")
      : "disponible";

    const promo = clean(document.querySelector("[class*='promo' i], [class*='badge' i], [data-testid*='promo' i]")?.textContent || (mainText.match(/(?:promo|promotion|offre|\-\d+\s*%|\d+\s*%\s*offert)/i)?.[0] || "")) || null;

    const formatQuantity = clean(mainText.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i)?.[0] || "") || null;

    const canonicalLink = document.querySelector("link[rel='canonical']")?.getAttribute("href") || window.location.href;
    const internalId = document.querySelector("[data-product-id]")?.getAttribute("data-product-id")
      || document.querySelector("[data-id]")?.getAttribute("data-id")
      || document.querySelector("[data-sku]")?.getAttribute("data-sku")
      || document.body?.getAttribute("data-product-id")
      || parseHrefId(canonicalLink)
      || null;

    const primaryImage = document.querySelector("main img, article img, img");
    const imageUrl = primaryImage?.currentSrc
      || primaryImage?.getAttribute("src")
      || primaryImage?.getAttribute("data-src")
      || null;

    const category = clean(
      Array.from(document.querySelectorAll("nav[aria-label*='fil' i] a, .breadcrumb a, [class*='breadcrumb' i] a"))
        .map((node) => node.textContent)
        .filter(Boolean)
        .join(" > ")
    ) || null;

    const nutritionRows = Array.from(document.querySelectorAll("table tr")).map((row) => clean(row.textContent)).filter(Boolean);
    const nutritionText = nutritionRows.length > 0
      ? nutritionRows.join(" | ")
      : pickSection([/valeurs? nutritionnelles?/i, /informations? nutritionnelles?/i])
        || pickMetaValue([/valeurs? nutritionnelles?/i, /informations? nutritionnelles?/i]);

    return {
      name: name || null,
      unitPrice: parsePrice(mainText),
      pricePerUnit: parseUnitPrice(mainText),
      availability,
      promo,
      formatQuantity,
      internalId,
      productUrl: window.location.href,
      imageUrl,
      category,
      description: pickSection([/description/i, /détails?/i, /details?/i]) || pickMetaValue([/description/i]),
      allergens: pickSection([/allerg[eè]nes?/i]) || pickMetaValue([/allerg[eè]nes?/i]),
      ingredients: pickSection([/ingr[eé]dients?/i, /ingredients?/i, /composition/i]) || pickMetaValue([/ingr[eé]dients?/i, /ingredients?/i, /composition/i]),
      nutrition: nutritionText
    };
  });

  if (Number.isFinite(details.unitPrice)) {
    console.log(`💰 Prix détecté: ${details.unitPrice}€`);
  }
  if (details.promo) {
    console.log(`🏷️ Promo détectée: ${details.promo}`);
  }

  logger.push("extractProductDetails:success");
  return buildDetailAliases(details);
}

async function snapshotCartCount(page) {
  try {
    return await page.evaluate((selectors) => {
      const toNumber = (text) => {
        const match = String(text || "").match(/\d+/);
        return match ? Number(match[0]) : null;
      };

      let maxCount = 0;
      for (const sel of selectors) {
        const nodes = Array.from(document.querySelectorAll(sel));
        for (const node of nodes) {
          const value = toNumber(node.textContent) || toNumber(node.getAttribute("aria-label"));
          if (Number.isFinite(value) && value > maxCount) {
            maxCount = value;
          }
        }
      }
      return maxCount;
    }, LECLERC_CART_SIGNALS);
  } catch (_) {
    return 0;
  }
}

async function searchProduct(page, query, options = {}) {
  const safeQuery = String(query || "").trim();
  const timeout = Number(options.timeout) || 20000;
  if (!safeQuery) {
    return { success: false, query: safeQuery, selector: null, products: [], error: "Requête produit vide" };
  }

  logger.push(`searchProduct:start query=${safeQuery}`);

  // If we are still on the store details step, open catalog first.
  const catalogEntrySelectors = [
    "button:has-text('Commencer mes courses')",
    "a:has-text('Commencer mes courses')",
    "button:has-text('Continuer')",
    "a:has-text('Continuer')"
  ];

  for (const sel of catalogEntrySelectors) {
    try {
      const entry = page.locator(sel).first();
      if (await entry.count() > 0 && await entry.isVisible({ timeout: 200 })) {
        await entry.click({ timeout: 3000 });
        await page.waitForTimeout(1200);
        break;
      }
    } catch (_) {
      // optional transition step
    }
  }

  const inputSelector = await waitAnySelector(page, LECLERC_PRODUCT_SEARCH_SELECTORS, Math.min(timeout, 12000));
  if (!inputSelector) {
    return {
      success: false,
      query: safeQuery,
      selector: null,
      products: [],
      error: "Champ de recherche produit introuvable"
    };
  }

  try {
    const inputs = page.locator(inputSelector);
    const count = await inputs.count();
    let targetInput = null;

    for (let i = 0; i < count; i++) {
      const candidate = inputs.nth(i);
      const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);
      if (!visible) continue;

      const isInStorePopin = await candidate.evaluate((el) => {
        return !!el.closest("#ctl00_WctlWCTD224_PopinManager1")
          || !!el.closest(".divWCTD224_PopinManager")
          || !!el.closest(".Annuaire__service");
      }).catch(() => false);

      if (isInStorePopin) {
        continue;
      }

      targetInput = candidate;
      break;
    }

    if (!targetInput) {
      return {
        success: false,
        query: safeQuery,
        selector: inputSelector,
        products: [],
        error: "Champ de recherche produit trouvé mais bloqué par la popin magasin"
      };
    }

    await targetInput.click({ timeout: 5000 });
    await targetInput.fill("");
    await targetInput.type(safeQuery, { delay: 40 });
    try {
      await page.keyboard.press("Enter");
    } catch (_) {
      const submitSelector = await waitAnySelector(page, LECLERC_PRODUCT_SUBMIT_SELECTORS, 2000);
      if (submitSelector) {
        await page.click(submitSelector, { timeout: 3000 });
      }
    }
  } catch (err) {
    return {
      success: false,
      query: safeQuery,
      selector: inputSelector,
      products: [],
      error: `Saisie recherche échouée: ${err.message}`
    };
  }

  await waitAnySelector(page, LECLERC_PRODUCT_CARD_SELECTORS, Math.min(timeout, 10000)).catch(() => null);

  let cardSelector = null;
  for (const candidate of LECLERC_PRODUCT_CARD_SELECTORS) {
    try {
      const score = await page.evaluate((selector) => {
        const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 40);
        let valid = 0;
        for (const node of nodes) {
          const text = (node.textContent || "").replace(/\s+/g, " ").trim();
          if (!text) continue;
          if (/1\.\s*je\s+saisis|2\.\s*je\s+commande|3\.\s*mes\s+courses/i.test(text)) continue;
          if (/rayons|promotions|nos bons plans/i.test(text)) continue;
          const hasPrice = /\d{1,4}(?:[.,]\d{1,2})\s*€/i.test(text) || /\d{1,4}\s*€\s*[,.]?\s*\d{2}\b/i.test(text);
          const hasAdd = /ajouter|panier/i.test(text);
          if (hasPrice || hasAdd) {
            valid += 1;
          }
        }
        return valid;
      }, candidate);

      if (score > 0) {
        cardSelector = candidate;
        break;
      }
    } catch (_) {
      // unsupported selector in page context
    }
  }

  if (!cardSelector) {
    return {
      success: false,
      query: safeQuery,
      selector: inputSelector,
      products: [],
      error: `Résultats produits introuvables après ${timeout}ms`
    };
  }

  const products = await page.evaluate((selector) => {
    const cards = Array.from(document.querySelectorAll(selector)).slice(0, 24);
    return cards.map((card, idx) => {
      const text = (card.textContent || "").replace(/\s+/g, " ").trim();
      const lines = text.split(" ").filter(Boolean);
      const splitPriceMatch = text.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
      const priceMatch = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i);
      const name = lines.slice(0, 12).join(" ").slice(0, 140);
      const unavailable = /indisponible|rupture|non disponible/i.test(text);
      return {
        index: idx + 1,
        name: name || `Produit ${idx + 1}`,
        price: splitPriceMatch
          ? Number(`${splitPriceMatch[1]}.${splitPriceMatch[2]}`)
          : (priceMatch ? Number(String(priceMatch[1]).replace(",", ".")) : null),
        available: !unavailable,
        id: card.getAttribute("data-product-id")
          || card.getAttribute("data-testid")
          || card.getAttribute("data-vignette")
          || card.getAttribute("id")
          || `card-${idx + 1}`
      };
    }).filter((p) => {
      if (!p.name || p.name.length === 0) return false;
      if (/1\.\s*je\s+saisis|2\.\s*je\s+commande|3\.\s*mes\s+courses/i.test(p.name)) return false;
      if (/rayons|promotions|nos bons plans/i.test(p.name)) return false;
      return p.price !== null || p.available;
    });
  }, cardSelector);

  if (!products.length) {
    return {
      success: false,
      query: safeQuery,
      selector: inputSelector,
      products,
      error: "Aucune carte produit exploitable extraite"
    };
  }

  for (const product of products.slice(0, 3)) {
    console.log(`🔍 Produit trouvé: ${product.name}${product.price ? ` (${product.price}€)` : ""}`);
  }
  logger.push(`searchProduct:found count=${products.length}`);

  return {
    success: true,
    query: safeQuery,
    selector: inputSelector,
    cardSelector,
    products,
    error: null
  };
}

async function selectProduct(page, index = 1, options = {}) {
  const timeout = Number(options.timeout) || 12000;
  const targetIndex = Math.max(1, Number(index) || 1);
  logger.push(`selectProduct:start index=${targetIndex}`);

  const cardSelector = await waitAnySelector(page, LECLERC_PRODUCT_CARD_SELECTORS, timeout);
  if (!cardSelector) {
    return { success: false, selector: null, index: targetIndex, error: "Cartes produits introuvables" };
  }

  try {
    const cards = page.locator(cardSelector);
    const count = await cards.count();
    if (count <= 0) {
      return { success: false, selector: cardSelector, index: targetIndex, error: "Aucune carte produit cliquable" };
    }

    const candidateIndexes = [];
    for (let i = 0; i < count; i++) {
      const txt = ((await cards.nth(i).textContent()) || "").replace(/\s+/g, " ").trim();
      if (!txt) continue;
      if (/1\.\s*je\s+saisis|2\.\s*je\s+commande|3\.\s*mes\s+courses|rayons|promotions|nos bons plans/i.test(txt)) {
        continue;
      }
      if (/\d{1,4}(?:[.,]\d{1,2})\s*€|ajouter|panier/i.test(txt)) {
        candidateIndexes.push(i);
      }
    }

    if (!candidateIndexes.length) {
      return { success: false, selector: cardSelector, index: targetIndex, error: "Aucune carte produit valide détectée" };
    }

    const chosenIndex = candidateIndexes[Math.min(targetIndex - 1, candidateIndexes.length - 1)];
    const chosen = cards.nth(chosenIndex);
    const cardText = ((await chosen.textContent()) || "").replace(/\s+/g, " ").trim();
    await chosen.click({ timeout: 5000 });
    console.log(`🔍 Produit sélectionné: ${cardText.slice(0, 120) || `index ${targetIndex}`}`);
    logger.push(`selectProduct:clicked selector=${cardSelector} index=${targetIndex}`);

    const addButtonSelector = await waitAnySelector(page, LECLERC_ADD_TO_CART_SELECTORS, timeout);
    if (!addButtonSelector) {
      return {
        success: false,
        selector: cardSelector,
        index: targetIndex,
        error: "Fiche produit ouverte mais bouton Ajouter introuvable"
      };
    }

    return { success: true, selector: cardSelector, index: targetIndex, error: null };
  } catch (err) {
    return {
      success: false,
      selector: cardSelector,
      index: targetIndex,
      error: `Sélection produit échouée: ${err.message}`
    };
  }
}

async function addToCart(page, options = {}) {
  const timeout = Number(options.timeout) || 15000;
  logger.push("addToCart:start");

  const beforeCount = await snapshotCartCount(page);
  const addSelector = await waitAnySelector(page, LECLERC_ADD_TO_CART_SELECTORS, timeout);
  if (!addSelector) {
    return { success: false, selector: null, error: "Bouton Ajouter au panier introuvable" };
  }

  try {
    await page.click(addSelector, { timeout: 5000 });
    console.log(`🛒 Ajout au panier: ${addSelector}`);
    logger.push(`addToCart:clicked selector=${addSelector}`);
  } catch (err) {
    return { success: false, selector: addSelector, error: `Clic ajout panier échoué: ${err.message}` };
  }

  // Handle quantity/format prompts if they appear.
  const quantityFallbacks = [
    "button:has-text('Continuer')",
    "button:has-text('Valider')",
    "button:has-text('Confirmer')",
    "button:has-text('OK')",
    "button:has-text('Ajouter')"
  ];

  for (const sel of quantityFallbacks) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 250 })) {
        await btn.click({ timeout: 1500 });
        break;
      }
    } catch (_) {
      // ignore optional prompt
    }
  }

  let updated = false;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const afterCount = await snapshotCartCount(page);
    if (afterCount > beforeCount) {
      updated = true;
      break;
    }

    try {
      const hasToast = await page.evaluate(() => {
        const body = (document.body?.innerText || "").toLowerCase();
        return body.includes("ajouté au panier")
          || body.includes("article ajouté")
          || body.includes("panier mis à jour")
          || body.includes("commander");
      });
      if (hasToast) {
        updated = true;
        break;
      }
    } catch (_) {
      // keep polling
    }

    await page.waitForTimeout(300);
  }

  if (!updated) {
    return {
      success: false,
      selector: addSelector,
      error: `Panier non mis à jour après ${timeout}ms`
    };
  }

  console.log("📦 Panier mis à jour");
  logger.push("addToCart:cart_updated");
  return { success: true, selector: addSelector, error: null };
}

async function snapshotCarrefourCartCount(page, extraSignals = []) {
  const signals = uniqueTexts([
    ...extraSignals,
    ...CARREFOUR_CART_SIGNALS
  ]);

  try {
    return await page.evaluate((selectors) => {
      const readNumber = (value) => {
        const match = String(value || "").match(/\d+/);
        return match ? Number(match[0]) : null;
      };

      let max = 0;
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          const fromText = readNumber(node.textContent);
          const fromAria = readNumber(node.getAttribute("aria-label"));
          const current = Number.isFinite(fromText) ? fromText : fromAria;
          if (Number.isFinite(current) && current > max) {
            max = current;
          }
        }
      }

      return max;
    }, signals);
  } catch (_) {
    return 0;
  }
}

async function snapshotCarrefourCartAmount(page) {
  try {
    return await page.evaluate(() => {
      const amountNode = document.querySelector("[data-testid='mainbar-item-cart_amount']");
      if (!amountNode) return 0;
      const text = String(amountNode.textContent || "");
      const spaced = text.match(/(\d{1,4})\s*[,.]\s*(\d{1,2})/);
      if (spaced) {
        return Number(`${spaced[1]}.${spaced[2]}`);
      }
      const direct = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)/);
      return direct ? Number(String(direct[1]).replace(",", ".")) : 0;
    });
  } catch (_) {
    return 0;
  }
}

async function selectCarrefourStore(page, city, options = {}) {
  const safeCity = String(city || "").trim();
  const timeout = Math.max(6000, Number(options.timeout) || 30000);
  const extraStoreSearchSelectors = Array.isArray(options.extraStoreSearchSelectors)
    ? options.extraStoreSearchSelectors
    : [];
  const extraStoreCardSelectors = Array.isArray(options.extraStoreCardSelectors)
    ? options.extraStoreCardSelectors
    : [];
  const extraStoreButtonSelectors = Array.isArray(options.extraStoreButtonSelectors)
    ? options.extraStoreButtonSelectors
    : [];

  if (!safeCity) {
    return { success: false, city: safeCity, storeName: null, error: "Ville invalide" };
  }

  logger.push(`selectCarrefourStore:start city=${safeCity}`);
  console.log(`🛒 Carrefour: sélection du magasin pour ${safeCity}`);

  const currentUrl = String(page.url() || "").toLowerCase();
  if (!currentUrl.includes("carrefour.fr/services/drive") && !currentUrl.includes("carrefour.fr/courses/drive")) {
    await page.goto(CARREFOUR_DRIVE_URL, { waitUntil: "domcontentloaded", timeout });
    await page.waitForTimeout(1200);
  }

  const startSelectors = uniqueTexts([
    "[data-testid='sub-header-switch__modal']",
    "[role='dialog'] input[name='addressSearch']"
  ]);

  const hasOpenDialog = await waitAnySelector(page, startSelectors, 1200);
  if (!hasOpenDialog) {
    const selectedDriveSignal = await waitAnySelector(page, [
      "button:has-text('Changer de drive')",
      "a:has-text('Changer de drive')",
      "button:has-text('Commencer mes courses')",
      "text=Votre magasin actuel"
    ], 1500);

    if (selectedDriveSignal) {
      const selectedDriveName = await page.evaluate(() => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const body = clean(document.body?.innerText || "");
        const match = body.match(/Votre magasin actuel\s*:?\s*([^\n]{3,80})/i);
        return clean(match?.[1] || "") || null;
      }).catch(() => null);

      logger.push(`selectCarrefourStore:already_selected_signal store=${selectedDriveName || safeCity}`);
      console.log(`📦 Carrefour magasin déjà sélectionné: ${selectedDriveName || safeCity}`);
      return {
        success: true,
        city: safeCity,
        storeName: selectedDriveName || safeCity,
        error: null
      };
    }

    const alreadySelectedState = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const body = clean(document.body?.innerText || "");
      const hasCatalogEntry = /faire mes courses|commencer mes courses|mes produits|pré-réserver un créneau|changer de drive/i.test(body);
      const storeMatch = body.match(/Drive\s+([^\n]{3,80})/i);
      return {
        hasCatalogEntry,
        storeName: clean(storeMatch?.[1] || "") || null
      };
    }).catch(() => ({ hasCatalogEntry: false, storeName: null }));

    if (alreadySelectedState.hasCatalogEntry) {
      logger.push(`selectCarrefourStore:already_selected store=${alreadySelectedState.storeName || safeCity}`);
      console.log(`📦 Carrefour magasin déjà sélectionné: ${alreadySelectedState.storeName || safeCity}`);
      return {
        success: true,
        city: safeCity,
        storeName: alreadySelectedState.storeName || safeCity,
        error: null
      };
    }

    const opened = await safeClick(page, [
      "button:has-text('Commencer mes courses')",
      "a:has-text('Commencer mes courses')",
      "button:has-text('Trouver un magasin')",
      "a:has-text('Trouver un magasin')"
    ], "entrée choix magasin Carrefour");

    if (!opened) {
      return {
        success: false,
        city: safeCity,
        storeName: null,
        error: "Ouverture de la modale magasin Carrefour impossible"
      };
    }

    await page.waitForTimeout(1200);
  }

  await safeClick(page, [
    "#onetrust-accept-btn-handler",
    "button:has-text('Tout accepter')",
    "button:has-text('Accepter')"
  ], "cookies Carrefour");

  const storeInputSelectors = uniqueTexts([
    ...extraStoreSearchSelectors,
    ...CARREFOUR_STORE_SEARCH_SELECTORS
  ]);

  const storeInputSelector = await waitAnySelector(page, storeInputSelectors, Math.min(timeout, 14000));
  if (!storeInputSelector) {
    return {
      success: false,
      city: safeCity,
      storeName: null,
      error: "Champ de recherche magasin Carrefour introuvable"
    };
  }

  try {
    const inputs = page.locator(storeInputSelector);
    const count = await inputs.count();
    let targetInput = null;

    for (let i = 0; i < count; i++) {
      const candidate = inputs.nth(i);
      const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);
      if (!visible) continue;
      targetInput = candidate;
      break;
    }

    if (!targetInput) {
      return {
        success: false,
        city: safeCity,
        storeName: null,
        error: "Input magasin détecté mais non visible"
      };
    }

    await targetInput.click({ timeout: 5000 });
    await targetInput.fill("");
    await targetInput.type(safeCity, { delay: 60 });
    await page.waitForTimeout(1200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
  } catch (error) {
    return {
      success: false,
      city: safeCity,
      storeName: null,
      error: `Saisie ville échouée: ${error.message}`
    };
  }

  const storeCardSelectors = uniqueTexts([
    ...extraStoreCardSelectors,
    ...CARREFOUR_STORE_CARD_SELECTORS
  ]);

  let readyStoreSelector = null;
  const storeDeadline = Date.now() + Math.min(timeout, 20000);
  while (Date.now() < storeDeadline) {
    readyStoreSelector = await waitAnySelector(page, storeCardSelectors, 1500);
    if (readyStoreSelector) {
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!readyStoreSelector) {
    return {
      success: false,
      city: safeCity,
      storeName: null,
      error: "Liste des magasins Carrefour introuvable"
    };
  }

  const storeButtonSelectors = uniqueTexts([
    ...extraStoreButtonSelectors,
    ...CARREFOUR_STORE_SELECT_BUTTONS
  ]);

  const clickResult = await page.evaluate(({ cardSelectors, buttonSelectors }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const dispatchClick = (node) => {
      if (!node) return;
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
      } catch (_) {
        // best effort
      }
    };

    const dialog = document.querySelector("[role='dialog']") || document;
    const cards = [];
    const seen = new Set();
    for (const selector of cardSelectors) {
      for (const node of dialog.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        cards.push(node);
      }
    }

    const visibleCards = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return false;
      const text = clean(card.innerText || card.textContent).toLowerCase();
      if (!text) return false;
      if (text.includes("indisponible") || text.includes("ferm") || text.includes("complet") || text.includes("bientôt disponibles")) return false;
      return true;
    });

    const firstCard = visibleCards[0] || null;
    if (!firstCard) {
      return { clicked: false, storeName: null };
    }

    let clicked = false;
    let storeName = clean(firstCard.innerText || firstCard.textContent).slice(0, 140) || null;

    for (const selector of buttonSelectors) {
      try {
        const button = firstCard.matches(selector) ? firstCard : firstCard.querySelector(selector);
        if (button) {
          dispatchClick(button);
          clicked = true;
          break;
        }
      } catch (_) {
        // selector may be unsupported in querySelector
      }
    }

    if (!clicked) {
      const fallbackButton = firstCard.querySelector("button, a, [role='button']");
      if (fallbackButton) {
        dispatchClick(fallbackButton);
        clicked = true;
      }
    }

    if (!clicked) {
      dispatchClick(firstCard);
      clicked = true;
    }

    return { clicked, storeName };
  }, {
    cardSelectors: storeCardSelectors,
    buttonSelectors: storeButtonSelectors
  });

  if (!clickResult.clicked) {
    return {
      success: false,
      city: safeCity,
      storeName: null,
      error: "Aucun magasin Carrefour sélectionnable"
    };
  }

  await page.waitForTimeout(1200);

  await safeClick(page, [
    "button:has-text('Continuer')",
    "button:has-text('Valider')",
    "button:has-text('Choisir ce magasin')"
  ], "validation magasin Carrefour");

  const selectedStoreSignals = uniqueTexts([
    ...CARREFOUR_SELECTED_STORE_SIGNALS,
    "button:has-text('Mon magasin')",
    "a[href*='/courses']",
    "a[href*='/catalogue']"
  ]);

  let selected = false;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const url = String(page.url() || "").toLowerCase();
    if (url.includes("/catalogue") || url.includes("/recherche") || url.includes("/courses") || url.includes("courses.carrefour.fr")) {
      selected = true;
      break;
    }

    const dialogStillVisible = await page.locator("[role='dialog']").count().catch(() => 0);
    if (dialogStillVisible === 0) {
      selected = true;
      break;
    }

    const signal = await waitAnySelector(page, selectedStoreSignals, 800);
    if (signal) {
      selected = true;
      break;
    }

    const textSignal = await page.evaluate((cityValue) => {
      const body = (document.body?.innerText || "").toLowerCase();
      const cityLower = String(cityValue || "").toLowerCase();
      if (!cityLower) return false;
      return body.includes(cityLower) && (body.includes("mon magasin") || body.includes("magasin sélectionné") || body.includes("magasin selectionne"));
    }, safeCity).catch(() => false);

    if (textSignal) {
      selected = true;
      break;
    }

    await page.waitForTimeout(350);
  }

  if (!selected) {
    return {
      success: false,
      city: safeCity,
      storeName: clickResult.storeName,
      error: "Sélection magasin Carrefour non confirmée"
    };
  }

  console.log(`📦 Carrefour magasin sélectionné: ${clickResult.storeName || safeCity}`);
  logger.push(`selectCarrefourStore:success store=${clickResult.storeName || safeCity}`);

  return {
    success: true,
    city: safeCity,
    storeName: clickResult.storeName || safeCity,
    error: null
  };
}

async function searchCarrefourProduct(page, query, options = {}) {
  const safeQuery = String(query || "").trim();
  const timeout = Math.max(6000, Number(options.timeout) || 20000);
  const extraSearchSelectors = Array.isArray(options.extraSearchSelectors)
    ? options.extraSearchSelectors
    : [];
  const extraSubmitSelectors = Array.isArray(options.extraSubmitSelectors)
    ? options.extraSubmitSelectors
    : [];
  const extraProductCardSelectors = Array.isArray(options.extraProductCardSelectors)
    ? options.extraProductCardSelectors
    : [];

  if (!safeQuery) {
    return { success: false, query: safeQuery, selector: null, productsCount: 0, error: "Requête vide" };
  }

  console.log(`🔍 Carrefour recherche: ${safeQuery}`);
  logger.push(`searchCarrefourProduct:start query=${safeQuery}`);

  const currentUrl = String(page.url() || "").toLowerCase();
  if (currentUrl.includes("/magasin")) {
    await page.goto("https://www.carrefour.fr/services/drive", { waitUntil: "domcontentloaded", timeout });
    await page.waitForTimeout(1000);
  }

  const catalogEntry = await waitAnySelector(page, [
    "button:has-text('Faire mes courses')",
    "a:has-text('Faire mes courses')",
    "button:has-text('Mes produits')",
    "a[href*='/courses-en-5-min']"
  ], 2500);

  if (catalogEntry) {
    try {
      await page.locator(catalogEntry).first().click({ timeout: 4000 });
      await page.waitForTimeout(2500);
    } catch (_) {
      // keep current page and continue with search fallbacks
    }
  }

  const inputSelectors = uniqueTexts([
    ...extraSearchSelectors,
    ...CARREFOUR_SEARCH_INPUT_SELECTORS
  ]);
  const inputSelector = await waitAnySelector(page, inputSelectors, Math.min(timeout, 12000));

  if (!inputSelector) {
    return {
      success: false,
      query: safeQuery,
      selector: null,
      productsCount: 0,
      error: "Barre de recherche Carrefour introuvable"
    };
  }

  try {
    const candidates = page.locator(inputSelector);
    const count = await candidates.count();
    let targetInput = null;

    for (let i = 0; i < count; i++) {
      const current = candidates.nth(i);
      const visible = await current.isVisible({ timeout: 200 }).catch(() => false);
      if (!visible) continue;
      targetInput = current;
      break;
    }

    if (!targetInput) {
      return {
        success: false,
        query: safeQuery,
        selector: inputSelector,
        productsCount: 0,
        error: "Input recherche non visible"
      };
    }

    await targetInput.click({ timeout: 5000 });
    await targetInput.fill("");
    await targetInput.type(safeQuery, { delay: 35 });

    let submitted = false;
    try {
      await page.keyboard.press("Enter");
      submitted = true;
    } catch (_) {
      // fallback to submit button
    }

    if (!submitted) {
      const submitSelectors = uniqueTexts([
        ...extraSubmitSelectors,
        ...CARREFOUR_SEARCH_SUBMIT_SELECTORS
      ]);
      const submitSelector = await waitAnySelector(page, submitSelectors, 2500);
      if (submitSelector) {
        await page.click(submitSelector, { timeout: 3500 });
        submitted = true;
      }
    }

    if (!submitted) {
      return {
        success: false,
        query: safeQuery,
        selector: inputSelector,
        productsCount: 0,
        error: "Validation de la recherche Carrefour impossible"
      };
    }
  } catch (error) {
    return {
      success: false,
      query: safeQuery,
      selector: inputSelector,
      productsCount: 0,
      error: `Recherche Carrefour échouée: ${error.message}`
    };
  }

  const productCardSelectors = uniqueTexts([
    ...extraProductCardSelectors,
    ...CARREFOUR_PRODUCT_CARD_SELECTORS
  ]);

  const productsReady = await waitAnySelector(page, productCardSelectors, timeout);
  if (!productsReady) {
    return {
      success: false,
      query: safeQuery,
      selector: inputSelector,
      productsCount: 0,
      error: "Aucun résultat produit Carrefour détecté"
    };
  }

  const productsCount = await page.evaluate((selectors) => {
    for (const selector of selectors) {
      const count = document.querySelectorAll(selector).length;
      if (count > 0) return count;
    }
    return 0;
  }, productCardSelectors).catch(() => 0);

  logger.push(`searchCarrefourProduct:success count=${productsCount}`);
  return {
    success: true,
    query: safeQuery,
    selector: inputSelector,
    productsCount,
    error: null
  };
}

async function extractCarrefourProductList(page, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 20);
  const timeout = Math.max(4000, Number(options.timeout) || 18000);
  const extraCardSelectors = Array.isArray(options.extraCardSelectors)
    ? options.extraCardSelectors
    : [];

  console.log("📦 Carrefour extraction: produits");
  logger.push(`extractCarrefourProductList:start limit=${limit}`);

  const cardSelectors = uniqueTexts([
    ...extraCardSelectors,
    ...CARREFOUR_PRODUCT_CARD_SELECTORS
  ]);

  const readySelector = await waitAnySelector(page, cardSelectors, timeout);
  if (!readySelector) {
    logger.push("extractCarrefourProductList:cards_not_found");
    return [];
  }

  const products = await page.evaluate(({ selectors, maxItems }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const parsePrice = (text) => {
      const source = clean(text);
      const split = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
      if (split) {
        const parsed = Number(`${split[1]}.${split[2]}`);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const match = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i) || source.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
      if (!match) return null;
      const parsed = Number(String(match[1]).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseUnitPrice = (text) => {
      const source = clean(text);
      const split = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{1,4})\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
      if (split) {
        const parsed = Number(`${split[1]}.${split[2]}`);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const match = source.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
      if (!match) return null;
      const parsed = Number(String(match[1]).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseFormat = (text) => {
      const source = clean(text);
      const match = source.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i);
      return match ? clean(match[1]).replace(/\s+/g, "") : null;
    };

    const parseHrefId = (href) => {
      const source = String(href || "");
      const patterns = [
        /[?&](?:product(?:Id)?|id|ref|sku)=([^&#]+)/i,
        /\/produit\/([^/?#]+)/i,
        /\/p\/([^/?#]+)/i
      ];

      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match && clean(match[1])) return clean(match[1]);
      }

      return null;
    };

    const products = [];
    const unique = new Set();

    const addButtons = Array.from(document.querySelectorAll("button[aria-label*='Ajouter le produit' i], button[label='Acheter'], .buy-cta button, .add-to-cart button")).filter((button) => {
      if (!(button instanceof HTMLElement)) return false;
      const rect = button.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    });

    for (const addButton of addButtons) {
      const aria = clean(addButton.getAttribute("aria-label"));
      const nameFromAria = clean((aria.match(/Ajouter le produit\s+(.+?)\s+au panier/i) || [])[1] || "");

      let card = addButton.parentElement;
      while (card) {
        const text = clean(card.textContent);
        if (text.includes("€") && text.length > 20 && text.length < 2000) {
          break;
        }
        card = card.parentElement;
      }

      if (!card) continue;

      const text = clean(card.textContent);
      const nameNode = card.querySelector("h1, h2, h3, [data-testid*='product-name' i], [data-testid*='name' i], [class*='name' i], img[alt]");
      const name = clean(nameNode?.textContent || nameNode?.getAttribute?.("alt") || nameFromAria || "").slice(0, 180);
      if (!name) continue;

      const unitPrice = parsePrice(text);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

      const pricePerUnit = parseUnitPrice(text);
      const formatQuantity = parseFormat(text);
      const promo = clean((text.match(/(?:promo|promotion|offre|\-\d+\s*%|\d+\s*%\s*offert|club)/i)?.[0] || "")) || null;

      const unavailableText = text.match(/indisponible|rupture|non disponible/i)?.[0] || "";
      const disabled = addButton.disabled || addButton.getAttribute("aria-disabled") === "true";
      const availability = unavailableText ? clean(unavailableText) : (disabled ? "indisponible" : "disponible");

      const linkNode = card.querySelector("a[href*='/produit' i], a[href*='/p/' i], a[href]") || card.closest("a[href]");
      const productUrl = linkNode?.href || null;

      const imageNode = card.querySelector("img, source[srcset]") || card.parentElement?.querySelector?.("img, source[srcset]");
      let imageUrl = imageNode?.currentSrc || imageNode?.getAttribute?.("src") || imageNode?.getAttribute?.("data-src") || null;
      if (!imageUrl) {
        const srcSet = imageNode?.getAttribute?.("srcset");
        if (srcSet) imageUrl = clean(srcSet.split(",")[0].split(" ")[0]);
      }

      const internalId = clean(
        card.getAttribute("data-product-id")
          || card.getAttribute("data-id")
          || card.getAttribute("data-sku")
          || addButton.getAttribute("data-product-id")
          || linkNode?.getAttribute?.("data-product-id")
          || parseHrefId(productUrl)
          || card.id
          || nameFromAria
      ) || null;

      const key = `${internalId || "none"}|${name.toLowerCase()}|${unitPrice}`;
      if (unique.has(key)) continue;
      unique.add(key);

      products.push({
        name,
        unitPrice,
        pricePerUnit,
        formatQuantity,
        availability,
        promo,
        internalId,
        productUrl,
        imageUrl
      });
    }

    return products.slice(0, maxItems);
  }, {
    selectors: cardSelectors,
    maxItems: limit
  }).catch(() => []);

  const normalized = products.map((product, index) => {
    const mapped = buildProductAliases({
      name: product.name || `Produit Carrefour ${index + 1}`,
      unitPrice: Number.isFinite(product.unitPrice) ? Number(product.unitPrice) : null,
      pricePerUnit: Number.isFinite(product.pricePerUnit) ? Number(product.pricePerUnit) : null,
      availability: product.availability || "inconnue",
      promo: product.promo || null,
      formatQuantity: product.formatQuantity || null,
      internalId: product.internalId || `carrefour-${index + 1}`,
      productUrl: product.productUrl || null,
      imageUrl: product.imageUrl || null,
      category: null
    });

    if (mapped.unitPrice !== null) {
      console.log(`💰 Prix détecté: ${mapped.name} -> ${mapped.unitPrice}€`);
    }
    if (mapped.promo) {
      console.log(`🏷️ Promo détectée: ${mapped.name} -> ${mapped.promo}`);
    }

    return mapped;
  });

  logger.push(`extractCarrefourProductList:success count=${normalized.length}`);
  return normalized;
}

async function addCarrefourToCart(page, index = 1, options = {}) {
  const timeout = Math.max(5000, Number(options.timeout) || 15000);
  const targetIndex = Math.max(1, Number(index) || 1);
  const extraCardSelectors = Array.isArray(options.extraCardSelectors)
    ? options.extraCardSelectors
    : [];
  const extraAddSelectors = Array.isArray(options.extraAddSelectors)
    ? options.extraAddSelectors
    : [];
  const extraCartSignals = Array.isArray(options.extraCartSignals)
    ? options.extraCartSignals
    : [];

  logger.push(`addCarrefourToCart:start index=${targetIndex}`);
  console.log(`🛒 Carrefour ajout au panier (index ${targetIndex})`);

  const beforeCount = await snapshotCarrefourCartCount(page, extraCartSignals);
  const beforeAmount = await snapshotCarrefourCartAmount(page);
  const addSelectors = uniqueTexts([
    ...extraAddSelectors,
    ...CARREFOUR_ADD_TO_CART_SELECTORS
  ]);

  const addSelector = await waitAnySelector(page, addSelectors, Math.min(timeout, 9000));
  if (!addSelector) {
    return { success: false, index: targetIndex, selector: null, error: "Boutons produit Carrefour introuvables" };
  }

  const clickResult = await page.evaluate(({ addButtonSelectors, wantedIndex }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const dispatchClick = (node) => {
      if (!node) return false;
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
        return true;
      } catch (_) {
        return false;
      }
    };

    const buttons = [];
    const seen = new Set();
    for (const selector of addButtonSelectors) {
      let matches = [];
      try {
        matches = Array.from(document.querySelectorAll(selector));
      } catch (_) {
        continue;
      }
      for (const node of matches) {
        if (!(node instanceof HTMLButtonElement || node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        const rect = node.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) continue;
        const disabled = node.disabled || node.getAttribute("aria-disabled") === "true";
        if (disabled) continue;
        const aria = clean(node.getAttribute("aria-label"));
        if (!/ajouter le produit|acheter|ajouter/i.test(`${aria} ${clean(node.textContent)}`)) continue;
        buttons.push(node);
      }
    }

    if (buttons.length === 0) {
      return { clicked: false, reason: "no_add_button", productName: null };
    }

    const targetButton = buttons[Math.min(Math.max(wantedIndex - 1, 0), buttons.length - 1)];
    const productName = clean((targetButton.getAttribute("aria-label") || "").match(/Ajouter le produit\s+(.+?)\s+au panier/i)?.[1] || targetButton.textContent || "").slice(0, 180);
    const ok = dispatchClick(targetButton);
    return { clicked: ok, reason: ok ? "button" : "dispatch_failed", productName };
  }, {
    addButtonSelectors: addSelectors,
    wantedIndex: targetIndex
  });

  if (!clickResult.clicked) {
    return {
      success: false,
      index: targetIndex,
      selector: addSelector,
      error: `Ajout panier Carrefour impossible (${clickResult.reason})`
    };
  }

  const maybeConfirmButtons = [
    "button:has-text('Continuer')",
    "button:has-text('Valider')",
    "button:has-text('Confirmer')",
    "button:has-text('OK')"
  ];
  await safeClick(page, maybeConfirmButtons, "confirmation ajout Carrefour");

  let updated = false;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const currentCount = await snapshotCarrefourCartCount(page, extraCartSignals);
    const currentAmount = await snapshotCarrefourCartAmount(page);
    if (currentCount > beforeCount || currentAmount > beforeAmount) {
      updated = true;
      break;
    }

    const toast = await page.evaluate(() => {
      const body = (document.body?.innerText || "").toLowerCase();
      return body.includes("ajout") && body.includes("panier");
    }).catch(() => false);
    if (toast) {
      updated = true;
      break;
    }

    await page.waitForTimeout(300);
  }

  if (!updated) {
    return {
      success: false,
      index: targetIndex,
      selector: addSelector,
      error: "Panier Carrefour non mis à jour"
    };
  }

  console.log(`📦 Carrefour panier mis à jour (${clickResult.productName || "produit"})`);
  logger.push("addCarrefourToCart:success");
  return {
    success: true,
    index: targetIndex,
    selector: addSelector,
    error: null
  };
}

async function snapshotIntermarcheCartCount(page, extraSignals = []) {
  const signals = uniqueTexts([
    ...extraSignals,
    ...INTERMARCHE_CART_SIGNALS
  ]);

  try {
    return await page.evaluate((selectors) => {
      const toNumber = (value) => {
        const match = String(value || "").match(/\d+/);
        return match ? Number(match[0]) : null;
      };

      let max = 0;
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          const fromText = toNumber(node.textContent);
          const fromAria = toNumber(node.getAttribute("aria-label"));
          const current = Number.isFinite(fromText) ? fromText : fromAria;
          if (Number.isFinite(current) && current > max) {
            max = current;
          }
        }
      }

      return max;
    }, signals);
  } catch (_) {
    return 0;
  }
}

async function selectIntermarcheStore(page, city, options = {}) {
  const safeCity = String(city || "").trim();
  const timeout = Math.max(6000, Number(options.timeout) || 30000);
  const extraStoreSearchSelectors = Array.isArray(options.extraStoreSearchSelectors)
    ? options.extraStoreSearchSelectors
    : [];
  const extraStoreCardSelectors = Array.isArray(options.extraStoreCardSelectors)
    ? options.extraStoreCardSelectors
    : [];
  const extraStoreButtonSelectors = Array.isArray(options.extraStoreButtonSelectors)
    ? options.extraStoreButtonSelectors
    : [];

  if (!safeCity) {
    return { success: false, city: safeCity, storeName: null, error: "Ville invalide" };
  }

  logger.push(`selectIntermarcheStore:start city=${safeCity}`);
  console.log(`🛒 Intermarché: sélection du magasin pour ${safeCity}`);

  const currentUrl = String(page.url() || "").toLowerCase();
  if (!currentUrl.includes("intermarche.com")) {
    await page.goto(INTERMARCHE_DRIVE_URL, { waitUntil: "domcontentloaded", timeout });
    await page.waitForTimeout(1200);
  }

  await dismissIntermarcheOverlays(page);

  const coursesEntrySelector = await waitAnySelector(page, INTERMARCHE_COURSES_ENTRY_SELECTORS, 3500);
  if (coursesEntrySelector) {
    try {
      await page.locator(coursesEntrySelector).first().click({ timeout: 4500 });
      await page.waitForTimeout(1300);
      await dismissIntermarcheOverlays(page);
    } catch (_) {
      // fallback with DOM click below
    }
  }

  await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };
    const dispatch = (node) => {
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
      } catch (_) {
        // ignore
      }
    };

    const nodes = Array.from(document.querySelectorAll("a, button, [role='button'], span, div"));
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = clean(node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "");
      if (text.includes("courses en ligne")) {
        dispatch(node.closest("a, button, [role='button']") || node);
        break;
      }
    }
  }).catch(() => {});

  await page.waitForTimeout(700);
  await dismissIntermarcheOverlays(page);

  const alreadySelectedState = await page.evaluate((storeInputSelectors, selectedSignals, searchSelectors, cityValue) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const lower = (value) => clean(value).toLowerCase();
    const bodyText = lower(document.body?.innerText || "");

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };

    const hasVisibleSelector = (selector) => {
      try {
        const nodes = Array.from(document.querySelectorAll(selector));
        return nodes.some((node) => isVisible(node));
      } catch (_) {
        return false;
      }
    };

    const hasStoreInput = storeInputSelectors.some((selector) => hasVisibleSelector(selector));
    const hasSelectedSignal = selectedSignals.some((selector) => hasVisibleSelector(selector));
    const hasSearchInput = searchSelectors.some((selector) => hasVisibleSelector(selector));
    const hasChooserCta = bodyText.includes("choisir mon magasin") || bodyText.includes("choisir votre magasin");
    const city = lower(cityValue || "");
    const hasCityContext = city.length > 0 && bodyText.includes(city);

    return {
      hasStoreInput,
      hasSelectedSignal,
      hasSearchInput,
      hasChooserCta,
      hasCityContext
    };
  }, INTERMARCHE_STORE_SEARCH_SELECTORS, INTERMARCHE_SELECTED_STORE_SIGNALS, INTERMARCHE_SEARCH_INPUT_SELECTORS, safeCity).catch(() => ({
    hasStoreInput: false,
    hasSelectedSignal: false,
    hasSearchInput: false,
    hasChooserCta: true,
    hasCityContext: false
  }));

  const treatAsAlreadySelected = alreadySelectedState.hasSelectedSignal
    || (!alreadySelectedState.hasStoreInput && !alreadySelectedState.hasChooserCta && (alreadySelectedState.hasSearchInput || alreadySelectedState.hasCityContext));

  if (treatAsAlreadySelected) {
    console.log(`📦 Intermarché magasin déjà sélectionné: ${safeCity}`);
    logger.push("selectIntermarcheStore:already_selected_shortcut");
    return {
      success: true,
      city: safeCity,
      storeName: safeCity,
      error: null
    };
  }

  const entrySelector = await waitAnySelector(page, INTERMARCHE_STORE_ENTRY_SELECTORS, 2000);
  if (entrySelector) {
    try {
      await page.locator(entrySelector).first().click({ timeout: 3500 });
      await page.waitForTimeout(900);
      await dismissIntermarcheOverlays(page);
    } catch (_) {
      // fallback below
    }
  }

  await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };
    const dispatch = (node) => {
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
      } catch (_) {
        // ignore
      }
    };

    const nodes = Array.from(document.querySelectorAll("a, button, [role='button'], span, div"));
    for (const node of nodes) {
      if (!isVisible(node)) continue;
      const text = clean(node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "");
      if (text === "choisir mon magasin" || text === "choisir votre magasin") {
        dispatch(node.closest("a, button, [role='button']") || node);
        break;
      }
    }
  }).catch(() => {});

  await page.waitForTimeout(700);
  await dismissIntermarcheOverlays(page);

  const storeInputSelectors = uniqueTexts([
    ...extraStoreSearchSelectors,
    ...INTERMARCHE_STORE_SEARCH_SELECTORS
  ]);

  const selectedSignal = await waitAnySelector(page, INTERMARCHE_SELECTED_STORE_SIGNALS, 1500);
  const storeInputSelector = await waitAnySelector(page, storeInputSelectors, 3500);
  if (selectedSignal && !storeInputSelector) {
    const selectedStoreName = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const body = clean(document.body?.innerText || "");
      const match = body.match(/(?:mon\s+magasin|magasin\s+s[ée]lectionn[ée])\s*:?\s*([^\n]{3,90})/i);
      return clean(match?.[1] || "") || null;
    }).catch(() => null);

    console.log(`📦 Intermarché magasin déjà sélectionné: ${selectedStoreName || safeCity}`);
    logger.push(`selectIntermarcheStore:already_selected store=${selectedStoreName || safeCity}`);
    return {
      success: true,
      city: safeCity,
      storeName: selectedStoreName || safeCity,
      error: null
    };
  }

  if (!storeInputSelector) {
    logger.push("selectIntermarcheStore:store_input_missing_soft_pass");
    console.log(`📦 Intermarché magasin supposé déjà sélectionné (input introuvable): ${safeCity}`);
    return {
      success: true,
      city: safeCity,
      storeName: safeCity,
      error: null
    };
  }

  try {
    const inputs = page.locator(storeInputSelector);
    const count = await inputs.count();
    let targetInput = null;

    for (let i = 0; i < count; i++) {
      const candidate = inputs.nth(i);
      const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);
      if (!visible) continue;
      targetInput = candidate;
      break;
    }

    if (!targetInput) {
      return {
        success: false,
        city: safeCity,
        storeName: null,
        error: "Input magasin détecté mais non visible"
      };
    }

    await targetInput.click({ timeout: 5000 });
    await targetInput.fill("");
    await targetInput.type(safeCity, { delay: 55 });
    await page.waitForTimeout(900);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
  } catch (error) {
    return {
      success: false,
      city: safeCity,
      storeName: null,
      error: `Saisie ville échouée: ${error.message}`
    };
  }

  const storeCardSelectors = uniqueTexts([
    ...extraStoreCardSelectors,
    ...INTERMARCHE_STORE_CARD_SELECTORS
  ]);

  let readyStoreSelector = null;
  const listDeadline = Date.now() + Math.min(timeout, 20000);
  while (Date.now() < listDeadline) {
    readyStoreSelector = await waitAnySelector(page, storeCardSelectors, 1200);
    if (readyStoreSelector) break;
    await page.waitForTimeout(250);
  }

  if (!readyStoreSelector) {
    logger.push("selectIntermarcheStore:store_list_missing_soft_pass");
    console.log(`📦 Intermarché magasin supposé déjà sélectionné (liste introuvable): ${safeCity}`);
    return {
      success: true,
      city: safeCity,
      storeName: safeCity,
      error: null
    };
  }

  const storeButtonSelectors = uniqueTexts([
    ...extraStoreButtonSelectors,
    ...INTERMARCHE_STORE_BUTTON_SELECTORS
  ]);

  const clickResult = await page.evaluate(({ cardSelectors, buttonSelectors }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const dispatch = (node) => {
      if (!node) return false;
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
        return true;
      } catch (_) {
        return false;
      }
    };

    const container = document.querySelector("[role='dialog']") || document;
    const cards = [];
    const seen = new Set();
    for (const selector of cardSelectors) {
      let list = [];
      try {
        list = Array.from(container.querySelectorAll(selector));
      } catch (_) {
        continue;
      }
      for (const node of list) {
        if (!(node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        const rect = node.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) continue;
        cards.push(node);
      }
    }

    const validCards = cards.filter((node) => {
      const text = clean(node.textContent).toLowerCase();
      if (!text) return false;
      return !/indisponible|ferm|ouverture prochaine|bient[oô]t disponible/i.test(text);
    });

    const firstCard = validCards[0] || null;
    if (!firstCard) {
      return { clicked: false, storeName: null };
    }

    const storeName = clean(firstCard.textContent).slice(0, 140) || null;
    let clicked = false;

    for (const selector of buttonSelectors) {
      let target = null;
      try {
        target = firstCard.matches(selector) ? firstCard : firstCard.querySelector(selector);
      } catch (_) {
        target = null;
      }
      if (!target) continue;
      clicked = dispatch(target);
      if (clicked) break;
    }

    if (!clicked) {
      const fallbackButton = firstCard.querySelector("button, a, [role='button']");
      if (fallbackButton) {
        clicked = dispatch(fallbackButton);
      }
    }

    if (!clicked) {
      clicked = dispatch(firstCard);
    }

    return { clicked, storeName };
  }, {
    cardSelectors: storeCardSelectors,
    buttonSelectors: storeButtonSelectors
  });

  if (!clickResult.clicked) {
    return {
      success: false,
      city: safeCity,
      storeName: null,
      error: "Aucun magasin Intermarché sélectionnable"
    };
  }

  await page.waitForTimeout(1000);
  await safeClick(page, [
    "button:has-text('Valider')",
    "button:has-text('Continuer')",
    "button:has-text('Choisir')"
  ], "validation magasin Intermarché");

  let selected = false;
  const confirmDeadline = Date.now() + timeout;
  while (Date.now() < confirmDeadline) {
    const url = String(page.url() || "").toLowerCase();
    if (url.includes("/drive/courses") || url.includes("/recherche") || url.includes("/catalogue") || url.includes("courses-en-ligne")) {
      selected = true;
      break;
    }

    const signal = await waitAnySelector(page, INTERMARCHE_SELECTED_STORE_SIGNALS, 900);
    if (signal) {
      const chooserStillVisible = await page.evaluate(() => {
        const text = (document.body?.innerText || "").toLowerCase();
        return text.includes("choisir mon magasin") || text.includes("choisir votre magasin");
      }).catch(() => true);

      if (!chooserStillVisible) {
        selected = true;
        break;
      }
    }

    const cityVisible = await page.evaluate((cityValue) => {
      const body = (document.body?.innerText || "").toLowerCase();
      const needle = String(cityValue || "").toLowerCase();
      const stillChooser = body.includes("choisir mon magasin") || body.includes("choisir votre magasin");
      if (stillChooser) {
        return false;
      }
      return needle.length > 0 && body.includes(needle)
        && (body.includes("mon magasin") || body.includes("magasin sélectionné") || body.includes("magasin selectionne"));
    }, safeCity).catch(() => false);

    if (cityVisible) {
      selected = true;
      break;
    }

    await page.waitForTimeout(300);
  }

  if (!selected) {
    return {
      success: false,
      city: safeCity,
      storeName: clickResult.storeName || null,
      error: "Sélection magasin Intermarché non confirmée"
    };
  }

  console.log(`📦 Intermarché magasin sélectionné: ${clickResult.storeName || safeCity}`);
  logger.push(`selectIntermarcheStore:success store=${clickResult.storeName || safeCity}`);

  return {
    success: true,
    city: safeCity,
    storeName: clickResult.storeName || safeCity,
    error: null
  };
}

async function searchIntermarcheProduct(page, query, options = {}) {
  const safeQuery = String(query || "").trim();
  const timeout = Math.max(6000, Number(options.timeout) || 20000);
  const extraSearchSelectors = Array.isArray(options.extraSearchSelectors)
    ? options.extraSearchSelectors
    : [];
  const extraSubmitSelectors = Array.isArray(options.extraSubmitSelectors)
    ? options.extraSubmitSelectors
    : [];
  const extraProductCardSelectors = Array.isArray(options.extraProductCardSelectors)
    ? options.extraProductCardSelectors
    : [];

  if (!safeQuery) {
    return { success: false, query: safeQuery, selector: null, productsCount: 0, error: "Requête vide" };
  }

  logger.push(`searchIntermarcheProduct:start query=${safeQuery}`);
  console.log(`🔍 Intermarché recherche: ${safeQuery}`);

  await dismissIntermarcheOverlays(page);

  const entrySelectors = [
    "a:has-text('Rechercher')",
    "button:has-text('Rechercher')",
    "a:has-text('Courses en ligne')",
    "button:has-text('Courses en ligne')",
    "a[href*='recherche' i]",
    "a[href*='courses' i]",
    "a[href*='catalogue' i]"
  ];

  const entry = await waitAnySelector(page, entrySelectors, 1500);
  if (entry) {
    try {
      await page.locator(entry).first().click({ timeout: 3500 });
      await page.waitForTimeout(1400);
      await dismissIntermarcheOverlays(page);
    } catch (_) {
      // keep current page and continue with fallbacks
    }
  }

  const domEntry = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    };

    const dispatch = (node) => {
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
        return true;
      } catch (_) {
        return false;
      }
    };

    const targets = Array.from(document.querySelectorAll("a, button, [role='button'], span, div")).filter((node) => {
      if (!isVisible(node)) return false;
      const text = clean(node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "");
      return text === "rechercher" || text === "courses en ligne" || text.includes("rechercher des produits");
    });

    for (const node of targets) {
      const clickable = node.closest("a, button, [role='button']") || node;
      if (dispatch(clickable)) {
        return { clicked: true, href: clickable.getAttribute?.("href") || null };
      }
    }

    const hrefCandidates = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href") || "").filter((href) => {
      const lower = String(href).toLowerCase();
      return lower.includes("recherche") || lower.includes("courses") || lower.includes("catalogue");
    });

    return { clicked: false, href: hrefCandidates[0] || null };
  }).catch(() => ({ clicked: false, href: null }));

  if (domEntry.clicked) {
    await page.waitForTimeout(1200);
    await dismissIntermarcheOverlays(page);
  }

  if (!domEntry.clicked && domEntry.href) {
    try {
      const absolute = new URL(domEntry.href, page.url()).toString();
      await page.goto(absolute, { waitUntil: "domcontentloaded", timeout: Math.min(timeout, 20000) });
      await page.waitForTimeout(1200);
      await dismissIntermarcheOverlays(page);
    } catch (_) {
      // keep current page
    }
  }

  const inputSelectors = uniqueTexts([
    ...extraSearchSelectors,
    ...INTERMARCHE_SEARCH_INPUT_SELECTORS
  ]);
  const inputSelector = await waitAnySelector(page, inputSelectors, Math.min(timeout, 12000));
  let usedSelector = inputSelector || null;
  let submittedViaFallback = false;

  if (inputSelector) {
    try {
      const candidates = page.locator(inputSelector);
      const count = await candidates.count();
      let targetInput = null;

      for (let i = 0; i < count; i++) {
        const current = candidates.nth(i);
        const visible = await current.isVisible({ timeout: 200 }).catch(() => false);
        if (!visible) continue;
        targetInput = current;
        break;
      }

      if (!targetInput) {
        usedSelector = null;
      } else {
        await targetInput.click({ timeout: 5000 });
        await targetInput.fill("");
        await targetInput.type(safeQuery, { delay: 35 });

        let submitted = false;
        try {
          await page.keyboard.press("Enter");
          submitted = true;
        } catch (_) {
          // submit fallback below
        }

        if (!submitted) {
          const submitSelectors = uniqueTexts([
            ...extraSubmitSelectors,
            ...INTERMARCHE_SEARCH_SUBMIT_SELECTORS
          ]);
          const submitSelector = await waitAnySelector(page, submitSelectors, 2500);
          if (submitSelector) {
            await page.click(submitSelector, { timeout: 3500 });
            submitted = true;
          }
        }

        if (!submitted) {
          usedSelector = null;
        }
      }
    } catch (_) {
      usedSelector = null;
    }
  }

  if (!usedSelector) {
    const domFallback = await page.evaluate((queryValue) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      };

      const scoreInput = (node) => {
        const attrs = clean([
          node.getAttribute("name"),
          node.getAttribute("id"),
          node.getAttribute("placeholder"),
          node.getAttribute("aria-label"),
          node.getAttribute("data-testid"),
          node.getAttribute("class")
        ].join(" "));

        let score = 0;
        if (node.getAttribute("type") === "search") score += 5;
        if (attrs.includes("search") || attrs.includes("recherche")) score += 4;
        if (attrs.includes("produit") || attrs.includes("courses")) score += 3;
        if (node.closest("header")) score += 2;
        if (node.closest("main")) score += 1;
        return score;
      };

      const candidates = Array.from(document.querySelectorAll("input[type='search'], input[type='text'], input:not([type])"))
        .filter((node) => isVisible(node) && !node.disabled && !node.readOnly)
        .map((node) => ({ node, score: scoreInput(node) }))
        .sort((a, b) => b.score - a.score);

      if (!candidates.length || candidates[0].score < 1) {
        return { ok: false, reason: "no_search_input_candidate" };
      }

      const target = candidates[0].node;
      target.focus();
      target.value = "";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.value = String(queryValue || "");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));

      const fallbackSubmit = Array.from(document.querySelectorAll("button[type='submit'], form button, button, [role='button']")).find((node) => {
        const text = clean(node.textContent || node.getAttribute("aria-label") || "");
        return isVisible(node) && (text.includes("rechercher") || text.includes("search") || text.includes("ok"));
      });
      if (fallbackSubmit) {
        try {
          fallbackSubmit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          if (typeof fallbackSubmit.click === "function") fallbackSubmit.click();
        } catch (_) {
          // ignore
        }
      }

      return { ok: true, reason: "dom_input_fallback" };
    }, safeQuery).catch(() => ({ ok: false, reason: "dom_fallback_error" }));

    if (!domFallback.ok) {
      const encoded = encodeURIComponent(safeQuery);
      const fallbackUrls = [
        `https://www.intermarche.com/enseigne/services/drive/recherche?q=${encoded}`,
        `https://www.intermarche.com/enseigne/services/drive/recherche?text=${encoded}`,
        `https://www.intermarche.com/drive/recherche?q=${encoded}`,
        `https://www.intermarche.com/drive/recherche?text=${encoded}`,
        `https://www.intermarche.com/enseigne/services/drive?search=${encoded}`
      ];

      let urlFallbackOk = false;
      for (const url of fallbackUrls) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(timeout, 22000) });
          await page.waitForTimeout(1200);
          await dismissIntermarcheOverlays(page);

          const hasResults = await page.evaluate(() => {
            const urlLower = String(window.location.href || "").toLowerCase();
            const body = String(document.body?.innerText || "").toLowerCase();
            const cardCount = document.querySelectorAll("[data-testid*='product' i], article[class*='product' i], li[class*='product' i], div[class*='product-card' i]").length;
            return cardCount >= 3 || (/(recherche|resultat|résultat)/.test(urlLower) && /(produit|ajouter|panier)/.test(body));
          }).catch(() => false);

          if (hasResults) {
            usedSelector = "__url_fallback_search__";
            urlFallbackOk = true;
            break;
          }
        } catch (_) {
          // try next URL
        }
      }

      if (!urlFallbackOk) {
        return {
          success: false,
          query: safeQuery,
          selector: null,
          productsCount: 0,
          error: "Barre de recherche Intermarché introuvable"
        };
      }
    }

    if (!usedSelector) {
      usedSelector = "__dom_fallback_input__";
      submittedViaFallback = true;
    }
  }

  if (submittedViaFallback) {
    await page.waitForTimeout(1400);
  }

  const productCardSelectors = uniqueTexts([
    ...extraProductCardSelectors,
    ...INTERMARCHE_PRODUCT_CARD_SELECTORS
  ]);

  const ready = await waitAnySelector(page, productCardSelectors, timeout);
  if (!ready) {
    return {
      success: false,
      query: safeQuery,
      selector: usedSelector,
      productsCount: 0,
      error: "Aucun résultat produit Intermarché détecté"
    };
  }

  const productsCount = await page.evaluate((selectors) => {
    for (const selector of selectors) {
      const count = document.querySelectorAll(selector).length;
      if (count > 0) return count;
    }
    return 0;
  }, productCardSelectors).catch(() => 0);

  logger.push(`searchIntermarcheProduct:success count=${productsCount}`);
  return {
    success: true,
    query: safeQuery,
    selector: usedSelector,
    productsCount,
    error: null
  };
}

async function extractIntermarcheProductList(page, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 20);
  const timeout = Math.max(4000, Number(options.timeout) || 18000);
  const extraCardSelectors = Array.isArray(options.extraCardSelectors)
    ? options.extraCardSelectors
    : [];

  console.log("📦 Intermarché extraction: produits");
  logger.push(`extractIntermarcheProductList:start limit=${limit}`);

  const cardSelectors = uniqueTexts([
    ...extraCardSelectors,
    ...INTERMARCHE_PRODUCT_CARD_SELECTORS
  ]);

  const ready = await waitAnySelector(page, cardSelectors, timeout);
  if (!ready) {
    logger.push("extractIntermarcheProductList:cards_not_found");
    return [];
  }

  const products = await page.evaluate(({ selectors, maxItems }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const parsePrice = (text) => {
      const source = clean(text);
      const split = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
      if (split) {
        const parsed = Number(`${split[1]}.${split[2]}`);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const match = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i) || source.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
      if (!match) return null;
      const parsed = Number(String(match[1]).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseUnitPrice = (text) => {
      const source = clean(text);
      const split = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{1,4})\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
      if (split) {
        const parsed = Number(`${split[1]}.${split[2]}`);
        return Number.isFinite(parsed) ? parsed : null;
      }
      const match = source.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
      if (!match) return null;
      const parsed = Number(String(match[1]).replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseFormat = (text) => {
      const source = clean(text);
      const match = source.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i);
      return match ? clean(match[1]).replace(/\s+/g, "") : null;
    };

    const parseHrefId = (href) => {
      const source = String(href || "");
      const patterns = [
        /[?&](?:product(?:Id)?|id|ref|sku)=([^&#]+)/i,
        /\/produit\/([^/?#]+)/i,
        /\/p\/([^/?#]+)/i,
        /\/produits?\/([^/?#]+)/i
      ];

      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match && clean(match[1])) return clean(match[1]);
      }

      return null;
    };

    const rootNodes = [];
    const seen = new Set();
    for (const selector of selectors) {
      let list = [];
      try {
        list = Array.from(document.querySelectorAll(selector));
      } catch (_) {
        continue;
      }
      for (const node of list) {
        if (!(node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        rootNodes.push(node);
      }
    }

    const cards = rootNodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) return false;
      const text = clean(node.innerText || node.textContent);
      if (!text) return false;
      return /(€|ajouter|panier|produit)/i.test(text);
    }).slice(0, Math.max(maxItems * 3, 30));

    const products = [];
    const dedup = new Set();

    for (const card of cards) {
      const text = clean(card.innerText || card.textContent);
      if (!text) continue;

      const nameNode = card.querySelector("h1, h2, h3, [data-testid*='product-name' i], [data-testid*='name' i], [class*='name' i], a[title], img[alt]");
      const name = clean(nameNode?.textContent || nameNode?.getAttribute?.("title") || nameNode?.getAttribute?.("alt") || "").slice(0, 180);
      const unitPrice = parsePrice(text);
      if (!name || !Number.isFinite(unitPrice) || unitPrice <= 0) continue;

      const pricePerUnit = parseUnitPrice(text);
      const formatQuantity = parseFormat(text);
      const promo = clean((text.match(/(?:promo|promotion|offre|remise|\-\d+\s*%|\d+\s*%\s*offert)/i)?.[0] || "")) || null;

      const addButton = card.querySelector("button[data-testid*='add' i], button[aria-label*='ajouter' i], button:disabled");
      const disabled = Boolean(addButton?.disabled || addButton?.getAttribute?.("aria-disabled") === "true");
      const unavailableText = text.match(/indisponible|rupture|non disponible/i)?.[0] || "";
      const availability = unavailableText ? clean(unavailableText) : (disabled ? "indisponible" : "disponible");

      const link = card.querySelector("a[href*='produit' i], a[href*='/p/' i], a[href*='/produits' i], a[href]") || card.closest("a[href]");
      const productUrl = link?.href || null;

      const imageNode = card.querySelector("img, source[srcset]");
      let imageUrl = imageNode?.currentSrc || imageNode?.getAttribute?.("src") || imageNode?.getAttribute?.("data-src") || null;
      if (!imageUrl) {
        const srcSet = imageNode?.getAttribute?.("srcset");
        if (srcSet) imageUrl = clean(srcSet.split(",")[0].split(" ")[0]);
      }

      const internalId = clean(
        card.getAttribute("data-product-id")
        || card.getAttribute("data-id")
        || card.getAttribute("data-sku")
        || addButton?.getAttribute?.("data-product-id")
        || link?.getAttribute?.("data-product-id")
        || parseHrefId(productUrl)
        || card.id
      ) || null;

      const key = `${internalId || "none"}|${name.toLowerCase()}|${unitPrice}`;
      if (dedup.has(key)) continue;
      dedup.add(key);

      products.push({
        name,
        unitPrice,
        pricePerUnit,
        formatQuantity,
        availability,
        promo,
        internalId,
        productUrl,
        imageUrl
      });
    }

    return products.slice(0, maxItems);
  }, {
    selectors: cardSelectors,
    maxItems: limit
  }).catch(() => []);

  const normalized = products.map((product, index) => {
    const mapped = buildProductAliases({
      name: product.name || `Produit Intermarché ${index + 1}`,
      unitPrice: Number.isFinite(product.unitPrice) ? Number(product.unitPrice) : null,
      pricePerUnit: Number.isFinite(product.pricePerUnit) ? Number(product.pricePerUnit) : null,
      availability: product.availability || "inconnue",
      promo: product.promo || null,
      formatQuantity: product.formatQuantity || null,
      internalId: product.internalId || `intermarche-${index + 1}`,
      productUrl: product.productUrl || null,
      imageUrl: product.imageUrl || null,
      category: null
    });

    if (mapped.unitPrice !== null) {
      console.log(`💰 Prix détecté: ${mapped.name} -> ${mapped.unitPrice}€`);
    }
    if (mapped.promo) {
      console.log(`🏷️ Promo détectée: ${mapped.name} -> ${mapped.promo}`);
    }

    return mapped;
  });

  logger.push(`extractIntermarcheProductList:success count=${normalized.length}`);
  return normalized;
}

async function addIntermarcheToCart(page, index = 1, options = {}) {
  const timeout = Math.max(5000, Number(options.timeout) || 15000);
  const targetIndex = Math.max(1, Number(index) || 1);
  const extraAddSelectors = Array.isArray(options.extraAddSelectors)
    ? options.extraAddSelectors
    : [];
  const extraCartSignals = Array.isArray(options.extraCartSignals)
    ? options.extraCartSignals
    : [];

  logger.push(`addIntermarcheToCart:start index=${targetIndex}`);
  console.log(`🛒 Intermarché ajout au panier (index ${targetIndex})`);

  const beforeCount = await snapshotIntermarcheCartCount(page, extraCartSignals);
  const addSelectors = uniqueTexts([
    ...extraAddSelectors,
    ...INTERMARCHE_ADD_TO_CART_SELECTORS
  ]);

  const addSelector = await waitAnySelector(page, addSelectors, Math.min(timeout, 10000));
  if (!addSelector) {
    return { success: false, index: targetIndex, selector: null, error: "Boutons Ajouter Intermarché introuvables" };
  }

  const clickResult = await page.evaluate(({ selectors, wantedIndex }) => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const dispatch = (node) => {
      if (!node) return false;
      try {
        node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        if (typeof node.click === "function") node.click();
        return true;
      } catch (_) {
        return false;
      }
    };

    const inferProductContext = (node) => {
      const card = node.closest("article, li, [data-testid*='product' i], [class*='product' i], [class*='card' i]");
      if (!card) return false;
      const text = clean(card.textContent || "");
      return /(€|produit|ajouter|panier)/i.test(text);
    };

    const buttons = [];
    const seen = new Set();
    for (const selector of selectors) {
      let list = [];
      try {
        list = Array.from(document.querySelectorAll(selector));
      } catch (_) {
        continue;
      }
      for (const button of list) {
        if (!(button instanceof HTMLElement)) continue;
        if (seen.has(button)) continue;
        seen.add(button);
        const rect = button.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) continue;
        const text = clean(button.textContent || "").toLowerCase();
        const aria = clean(button.getAttribute("aria-label") || "").toLowerCase();
        const title = clean(button.getAttribute("title") || "").toLowerCase();
        const testId = clean(button.getAttribute("data-testid") || "").toLowerCase();
        const classes = clean(button.getAttribute("class") || "").toLowerCase();
        const semanticHint = `${text} ${aria} ${title} ${testId} ${classes}`;

        const looksLikeAddButton = /ajouter|ajout|panier|acheter|add|cart|cta|buy/.test(semanticHint)
          || (inferProductContext(button) && button.tagName.toLowerCase() === "button");
        if (!looksLikeAddButton) continue;
        if (button.getAttribute("aria-disabled") === "true" || button.disabled) continue;
        buttons.push(button);
      }
    }

    if (!buttons.length) {
      const generic = Array.from(document.querySelectorAll("button, [role='button'], a")).filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (seen.has(node)) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) return false;
        const text = clean(node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "").toLowerCase();
        const testId = clean(node.getAttribute("data-testid") || "").toLowerCase();
        const classes = clean(node.getAttribute("class") || "").toLowerCase();
        const hint = `${text} ${testId} ${classes}`;
        if (!/ajouter|ajout|panier|acheter|add|cart|cta|buy/.test(hint)) return false;
        if (node.getAttribute("aria-disabled") === "true" || node.disabled) return false;
        return inferProductContext(node);
      });

      for (const node of generic) {
        buttons.push(node);
      }
    }

    if (!buttons.length) {
      return { clicked: false, reason: "no_button", productName: null };
    }

    const target = buttons[Math.min(Math.max(wantedIndex - 1, 0), buttons.length - 1)];
    const card = target.closest("article, li, [data-testid*='product' i], [class*='product' i]");
    const productName = clean(card?.querySelector("h1, h2, h3, [data-testid*='name' i], [class*='name' i]")?.textContent || card?.textContent || "").slice(0, 160) || null;
    const clicked = dispatch(target);
    return { clicked, reason: clicked ? "button" : "dispatch_failed", productName };
  }, {
    selectors: addSelectors,
    wantedIndex: targetIndex
  });

  if (!clickResult.clicked) {
    return {
      success: false,
      index: targetIndex,
      selector: addSelector,
      error: `Ajout panier Intermarché impossible (${clickResult.reason})`
    };
  }

  await safeClick(page, [
    "button:has-text('Continuer')",
    "button:has-text('Valider')",
    "button:has-text('Confirmer')",
    "button:has-text('OK')"
  ], "confirmation ajout Intermarché");

  let updated = false;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const currentCount = await snapshotIntermarcheCartCount(page, extraCartSignals);
    if (currentCount > beforeCount) {
      updated = true;
      break;
    }

    // Intermarché cart badge can represent unique products only.
    // Re-adding the same product may keep the count unchanged while the add is valid.
    if (beforeCount > 0 && currentCount > 0 && currentCount === beforeCount) {
      const stillHasCart = await page.evaluate(() => {
        const body = (document.body?.innerText || "").toLowerCase();
        return body.includes("panier") || body.includes("article") || body.includes("voir mon panier");
      }).catch(() => false);
      if (stillHasCart) {
        updated = true;
        break;
      }
    }

    const toast = await page.evaluate(() => {
      const body = (document.body?.innerText || "").toLowerCase();
      const hasAddToast = (body.includes("ajout") && body.includes("panier"))
        || body.includes("produit ajouté")
        || body.includes("produit ajoute")
        || body.includes("article ajouté")
        || body.includes("article ajoute")
        || body.includes("voir mon panier");

      const articleCountMatch = body.match(/(?:panier|article(?:s)?)\s*[:(\-\s]*([1-9]\d{0,2})\b/i);
      const hasArticleCount = Boolean(articleCountMatch);

      const quantitySignals = Array.from(document.querySelectorAll("button, span, div, a")).some((node) => {
        const text = String(node.textContent || "").toLowerCase().replace(/\s+/g, " ");
        if (!text) return false;
        return /retirer|supprimer|quantit[eé]|-\s*1|\+\s*1/.test(text);
      });

      return hasAddToast || hasArticleCount || quantitySignals;
    }).catch(() => false);
    if (toast) {
      updated = true;
      break;
    }

    await page.waitForTimeout(280);
  }

  if (!updated) {
    return {
      success: false,
      index: targetIndex,
      selector: addSelector,
      error: "Panier Intermarché non mis à jour"
    };
  }

  console.log(`📦 Intermarché panier mis à jour (${clickResult.productName || "produit"})`);
  logger.push("addIntermarcheToCart:success");

  async function snapshotSuperUCartCount(page, extraSignals = []) {
    const signals = uniqueTexts([
      ...extraSignals,
      ...SUPERU_CART_SIGNALS
    ]);

    try {
      return await page.evaluate((selectors) => {
        const readNumber = (value) => {
          const match = String(value || "").match(/\d+/);
          return match ? Number(match[0]) : null;
        };

        let max = 0;
        for (const selector of selectors) {
          const nodes = Array.from(document.querySelectorAll(selector));
          for (const node of nodes) {
            const fromText = readNumber(node.textContent);
            const fromAria = readNumber(node.getAttribute("aria-label"));
            const current = Number.isFinite(fromText) ? fromText : fromAria;
            if (Number.isFinite(current) && current > max) {
              max = current;
            }
          }
        }

        return max;
      }, signals);
    } catch (_) {
      return 0;
    }
  }

  async function selectSuperUStore(page, city, options = {}) {
    const safeCity = String(city || "").trim();
    const timeout = Math.max(6000, Number(options.timeout) || 30000);

    if (!safeCity) {
      return { success: false, city: safeCity, storeName: null, error: "Ville invalide" };
    }

    logger.push(`selectSuperUStore:start city=${safeCity}`);
    console.log(`🛒 Super U: sélection du magasin pour ${safeCity}`);

    const currentUrl = String(page.url() || "").toLowerCase();
    if (!currentUrl.includes("coursesu.com")) {
      await page.goto(SUPERU_DRIVE_URL, { waitUntil: "domcontentloaded", timeout });
      await page.waitForTimeout(1200);
    }

    // Dismiss overlays
    await dismissSuperUOverlays(page);

    // Check if store is already selected
    const alreadySelectedState = await page.evaluate(() => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const body = clean(document.body?.innerText || "");
      const hasCatalogEntry = /faire mes courses|commencer mes courses|mes produits|chercher|recherche|produit/i.test(body);
      return { hasCatalogEntry };
    }).catch(() => ({ hasCatalogEntry: false }));

    if (alreadySelectedState.hasCatalogEntry) {
      logger.push(`selectSuperUStore:already_selected store=${safeCity}`);
      console.log(`📦 Super U magasin probablement déjà sélectionné`);
      return { success: true, city: safeCity, storeName: safeCity, error: null };
    }

    // Open store selection modal if needed
    const opened = await safeClick(page, SUPERU_STORE_ENTRY_SELECTORS, "entrée choix magasin Super U");
    if (!opened) {
      const startSearchInput = await waitAnySelector(page, SUPERU_STORE_SEARCH_SELECTORS, 3000);
      if (!startSearchInput) {
        return {
          success: false,
          city: safeCity,
          storeName: null,
          error: "Ouverture de la sélection magasin Super U impossible"
        };
      }
    }

    await page.waitForTimeout(500);

    // Find and use store search input
    const storeInputSelector = await waitAnySelector(page, SUPERU_STORE_SEARCH_SELECTORS, Math.min(timeout, 14000));
    if (!storeInputSelector) {
      return {
        success: false,
        city: safeCity,
        storeName: null,
        error: "Champ de recherche magasin Super U introuvable"
      };
    }

    try {
      const inputs = page.locator(storeInputSelector);
      const count = await inputs.count();
      let targetInput = null;

      for (let i = 0; i < count; i++) {
        const candidate = inputs.nth(i);
        const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);
        if (!visible) continue;
        targetInput = candidate;
        break;
      }

      if (!targetInput) {
        return {
          success: false,
          city: safeCity,
          storeName: null,
          error: "Input magasin détecté mais non visible"
        };
      }

      await targetInput.click({ timeout: 5000 });
      await targetInput.fill("");
      await targetInput.type(safeCity, { delay: 60 });
      await page.waitForTimeout(800);
    } catch (error) {
      return {
        success: false,
        city: safeCity,
        storeName: null,
        error: `Saisie ville échouée: ${error.message}`
      };
    }

    // Wait for store options and select first one
    let storeCardFound = false;
    const storeDeadline = Date.now() + Math.min(timeout, 20000);
    while (Date.now() < storeDeadline && !storeCardFound) {
      for (const selector of SUPERU_STORE_CARD_SELECTORS) {
        try {
          const cards = page.locator(selector);
          const count = await cards.count();
          if (count > 0) {
            const firstCard = cards.nth(0);
            if (await firstCard.isVisible({ timeout: 500 })) {
              await firstCard.click({ timeout: 5000 });
              logger.push(`selectSuperUStore:store_card_clicked selector=${selector}`);
              storeCardFound = true;
              break;
            }
          }
        } catch (_) {
          // try next selector
        }
      }

      if (!storeCardFound) {
        await page.waitForTimeout(300);
      }
    }

    if (!storeCardFound) {
      return {
        success: false,
        city: safeCity,
        storeName: null,
        error: "Aucune carte magasin trouvée"
      };
    }

    // Click the "Choose store" button
    const chooseButtonFound = await safeClick(page, SUPERU_STORE_BUTTON_SELECTORS, "bouton choisir magasin");
    if (!chooseButtonFound) {
      logger.push(`selectSuperUStore:choose_button_not_found trying_fallback`);
      await page.waitForTimeout(1000);
    }

    // Verify store selection
    const deadline = Date.now() + Math.min(timeout, 10000);
    while (Date.now() < deadline) {
      const catalogReady = await page.evaluate(() => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const body = clean(document.body?.innerText || "");
        return /faire mes courses|commencer mes courses|chercher|recherche|produit|course/i.test(body);
      }).catch(() => false);

      if (catalogReady) {
        logger.push(`selectSuperUStore:store_selected city=${safeCity}`);
        console.log(`✅ Super U: magasin sélectionné pour ${safeCity}`);
        return { success: true, city: safeCity, storeName: safeCity, error: null };
      }

      await page.waitForTimeout(300);
    }

    return { success: true, city: safeCity, storeName: safeCity, error: null };
  }

  async function searchSuperUProduct(page, query, options = {}) {
    const safeQuery = String(query || "").trim();
    const timeout = Number(options.timeout) || 20000;

    if (!safeQuery) {
      return { success: false, query: safeQuery, selector: null, products: [], error: "Requête produit vide" };
    }

    logger.push(`searchSuperUProduct:start query=${safeQuery}`);
    console.log(`🔍 Super U: recherche de "${safeQuery}"`);

    const inputSelector = await waitAnySelector(page, SUPERU_SEARCH_INPUT_SELECTORS, Math.min(timeout, 12000));
    if (!inputSelector) {
      return {
        success: false,
        query: safeQuery,
        selector: null,
        products: [],
        error: "Champ de recherche produit introuvable"
      };
    }

    try {
      const inputs = page.locator(inputSelector);
      const count = await inputs.count();
      let targetInput = null;

      for (let i = 0; i < count; i++) {
        const candidate = inputs.nth(i);
        const visible = await candidate.isVisible({ timeout: 200 }).catch(() => false);
        if (!visible) continue;
        targetInput = candidate;
        break;
      }

      if (!targetInput) {
        return {
          success: false,
          query: safeQuery,
          selector: inputSelector,
          products: [],
          error: "Champ de recherche trouvé mais bloqué"
        };
      }

      await targetInput.click({ timeout: 5000 });
      await targetInput.fill("");
      await targetInput.type(safeQuery, { delay: 40 });
      try {
        await page.keyboard.press("Enter");
      } catch (_) {
        const submitSelector = await waitAnySelector(page, SUPERU_SEARCH_SUBMIT_SELECTORS, 2000);
        if (submitSelector) {
          await page.click(submitSelector, { timeout: 3000 });
        }
      }
    } catch (err) {
      return {
        success: false,
        query: safeQuery,
        selector: inputSelector,
        products: [],
        error: `Saisie recherche échouée: ${err.message}`
      };
    }

    await waitAnySelector(page, SUPERU_PRODUCT_CARD_SELECTORS, Math.min(timeout, 10000)).catch(() => null);

    const products = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("[data-testid*='product' i], article[class*='product' i], li[class*='product' i], div[class*='product-card' i]")).slice(0, 24);
      return cards.map((card, idx) => {
        const text = (card.textContent || "").replace(/\s+/g, " ").trim();
        const splitPriceMatch = text.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
        const priceMatch = text.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i);
        const name = text.split(/\d{1,4}(?:[.,]\d{1,2})\s*€/i)[0].replace(/^[\s\d•\-]*/, "").slice(0, 140);
        const unavailable = /indisponible|rupture|non disponible/i.test(text);
        return {
          index: idx + 1,
          name: name || `Produit ${idx + 1}`,
          price: splitPriceMatch
            ? Number(`${splitPriceMatch[1]}.${splitPriceMatch[2]}`)
            : (priceMatch ? Number(String(priceMatch[1]).replace(",", ".")) : null),
          available: !unavailable,
          id: card.getAttribute("data-product-id")
            || card.getAttribute("data-testid")
            || card.getAttribute("data-id")
            || card.getAttribute("id")
            || `card-${idx + 1}`
        };
      }).filter((p) => p.name && (p.price !== null || p.available));
    }).catch(() => []);

    if (!products.length) {
      return {
        success: false,
        query: safeQuery,
        selector: inputSelector,
        products,
        error: "Aucune carte produit exploitable extraite"
      };
    }

    for (const product of products.slice(0, 3)) {
      console.log(`🔍 Produit trouvé: ${product.name}${product.price ? ` (${product.price}€)` : ""}`);
    }
    logger.push(`searchSuperUProduct:found count=${products.length}`);

    return {
      success: true,
      query: safeQuery,
      selector: inputSelector,
      products,
      error: null
    };
  }

  async function extractSuperUProductList(page, options = {}) {
    const limit = Math.max(1, Number(options.limit) || 20);
    const timeout = Math.max(3000, Number(options.timeout) || 15000);
    const extraCardSelectors = Array.isArray(options.extraCardSelectors) ? options.extraCardSelectors : [];

    console.log("📄 Super U: extraction liste produits");
    logger.push(`extractSuperUProductList:start limit=${limit}`);

    const selectors = uniqueTexts([...extraCardSelectors, ...SUPERU_PRODUCT_CARD_SELECTORS]);

    let readySelector = null;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline && !readySelector) {
      for (const selector of selectors) {
        try {
          const loc = page.locator(selector).first();
          if (await loc.count() > 0 && await loc.isVisible({ timeout: 250 })) {
            readySelector = selector;
            break;
          }
        } catch (_) {
          // keep trying
        }
      }

      if (!readySelector) {
        await page.waitForTimeout(300);
      }
    }

    const extracted = await page.evaluate(({ cardSelectors, maxItems }) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

      const parsePrice = (value) => {
        const source = clean(value);
        const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{2})\b/i);
        if (splitMatch) {
          const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
          return Number.isFinite(parsed) ? parsed : null;
        }
        const match = source.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i) || source.match(/€\s*(\d{1,4}(?:[.,]\d{1,2})?)/i);
        if (!match) return null;
        const parsed = Number(String(match[1]).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const parseUnitPrice = (value) => {
        const source = clean(value);
        const splitMatch = source.match(/(\d{1,4})\s*€\s*[,.]?\s*(\d{1,4})\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
        if (splitMatch) {
          const parsed = Number(`${splitMatch[1]}.${splitMatch[2]}`);
          return Number.isFinite(parsed) ? parsed : null;
        }
        const match = source.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*€\s*\/\s*(kg|kilo|l|litre|ml|cl)/i);
        if (!match) return null;
        const parsed = Number(String(match[1]).replace(",", "."));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const parseFormat = (value) => {
        const source = clean(value);
        const match = source.match(/\b(\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl)|\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl))\b/i);
        return match ? clean(match[1]).replace(/\s+/g, "") : null;
      };

      const nodes = [];
      const seen = new Set();
      for (const selector of cardSelectors) {
        try {
          const list = Array.from(document.querySelectorAll(selector));
          for (const node of list) {
            if (!(node instanceof HTMLElement)) continue;
            if (seen.has(node)) continue;
            seen.add(node);
            nodes.push(node);
          }
        } catch (_) {
          // ignore
        }
      }

      const visibleCards = nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) return false;
        const text = clean(node.innerText || node.textContent);
        if (!text) return false;
        const hasPrice = /(\d{1,4}(?:[.,]\d{1,2})?)\s*€/i.test(text);
        return hasPrice;
      }).slice(0, Math.max(maxItems * 3, 30));

      const products = [];
      const uniqueByName = new Set();

      for (const card of visibleCards) {
        const text = clean(card.innerText || card.textContent);
        if (!text) continue;

        const beforePrice = text.split(/\d{1,4}(?:[.,]\d{1,2})\s*€/i)[0] || "";
        const name = clean(beforePrice).slice(0, 160) || "Produit inconnu";

        if (uniqueByName.has(name.toLowerCase())) continue;
        uniqueByName.add(name.toLowerCase());

        const price = parsePrice(text);
        if (!price || price <= 0) continue;

        const pricePerUnit = parseUnitPrice(text);
        const promoText = text.match(/(?:promo|promotion|offre|\-\d+\s*%|\d+\s*%\s*offert)/i)?.[0] || null;
        const availability = /indisponible|rupture|non disponible/i.test(text) ? "indisponible" : "disponible";
        const format = parseFormat(name || text);

        const imgNode = card.querySelector("img, source[srcset]");
        let imageUrl = null;
        if (imgNode) {
          imageUrl = imgNode.currentSrc || imgNode.getAttribute("src") || imgNode.getAttribute("data-src") || null;
        }

        products.push({
          name,
          unitPrice: price,
          pricePerUnit,
          availability,
          promo: promoText,
          formatQuantity: format,
          internalId: card.getAttribute("data-product-id") || card.getAttribute("data-id") || `prod-${products.length + 1}`,
          productUrl: card.querySelector("a")?.href || null,
          imageUrl,
          category: null
        });
      }

      return products.slice(0, maxItems);
    }, { cardSelectors: selectors, maxItems: limit }).catch(() => []);

    const normalized = extracted.map((product, index) => {
      const result = {
        name: product.name || `Produit ${index + 1}`,
        price: Number.isFinite(product.unitPrice) ? Number(product.unitPrice) : null,
        pricePerKg: Number.isFinite(product.pricePerUnit) ? Number(product.pricePerUnit) : null,
        availability: product.availability || "inconnue",
        promo: product.promo || null,
        quantity: product.formatQuantity || null,
        id: product.internalId || `fallback-${index + 1}`,
        url: product.productUrl || null,
        image: product.imageUrl || null
      };

      if (result.price !== null) {
        console.log(`💰 Prix détecté: ${result.name} -> ${result.price}€`);
      }
      if (result.promo) {
        console.log(`🏷️ Promo détectée: ${result.name} -> ${result.promo}`);
      }

      return result;
    });

    logger.push(`extractSuperUProductList:success count=${normalized.length}`);
    return normalized;
  }

  async function addSuperUToCart(page, index = 1, options = {}) {
    const timeout = Number(options.timeout) || 15000;
    const targetIndex = Math.max(1, Number(index) || 1);
    logger.push(`addSuperUToCart:start index=${targetIndex}`);

    const beforeCount = await snapshotSuperUCartCount(page);

    const addSelector = await waitAnySelector(page, SUPERU_ADD_TO_CART_SELECTORS, timeout);
    if (!addSelector) {
      return { success: false, selector: null, error: "Bouton Ajouter au panier introuvable" };
    }

    try {
      const buttons = page.locator(addSelector);
      const count = await buttons.count();
      let targetButton = null;

      for (let i = 0; i < Math.min(count, targetIndex + 5); i++) {
        const btn = buttons.nth(i);
        const visible = await btn.isVisible({ timeout: 200 }).catch(() => false);
        if (visible) {
          targetButton = btn;
          break;
        }
      }

      if (!targetButton) {
        return { success: false, selector: addSelector, error: "Bouton visible introuvable" };
      }

      await targetButton.click({ timeout: 5000 });
      console.log(`🛒 Super U: ajout au panier`);
      logger.push(`addSuperUToCart:clicked selector=${addSelector}`);
    } catch (err) {
      return { success: false, selector: addSelector, error: `Clic ajout panier échoué: ${err.message}` };
    }

    // Handle quantity/format prompts if they appear
    const quantityFallbacks = [
      "button:has-text('Continuer')",
      "button:has-text('Valider')",
      "button:has-text('Confirmer')",
      "button:has-text('OK')",
      "button:has-text('Ajouter')"
    ];

    for (const sel of quantityFallbacks) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible({ timeout: 250 })) {
          await btn.click({ timeout: 1500 });
          break;
        }
      } catch (_) {
        // ignore optional prompt
      }
    }

    let updated = false;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const afterCount = await snapshotSuperUCartCount(page);
      if (afterCount > beforeCount) {
        updated = true;
        break;
      }

      try {
        const hasToast = await page.evaluate(() => {
          const body = (document.body?.innerText || "").toLowerCase();
          return body.includes("ajouté au panier")
            || body.includes("article ajouté")
            || body.includes("panier mis à jour")
            || body.includes("commander");
        });
        if (hasToast) {
          updated = true;
          break;
        }
      } catch (_) {
        // keep polling
      }

      await page.waitForTimeout(300);
    }

    if (!updated) {
      return {
        success: false,
        selector: addSelector,
        error: `Panier non mis à jour après ${timeout}ms`
      };
    }

    console.log("📦 Super U: panier mis à jour");
    logger.push("addSuperUToCart:cart_updated");
    return { success: true, selector: addSelector, error: null };
  }
  return {
    success: true,
    index: targetIndex,
    selector: addSelector,
    error: null
  };
}

export {
  ACTIONS,
  SELECTORS,
  SELECTORS_BY_STORE,
  LECLERC_ARROW_SELECTORS,
  decideNextAction,
  detectPageType,
  findSearchInput,
  findAddToCartButton,
  detectCookieBanner,
  detectPopup,
  detectStoreSelectionPage,
  extractProductsFromHtml,
  parsePrice,
  parseQuantity,
  computePricePerKg,
  chooseBestProduct,
  selectLeclercDriveArrow,
  searchProduct,
  selectCarrefourStore,
  searchCarrefourProduct,
  extractCarrefourProductList,
  addCarrefourToCart,
  selectIntermarcheStore,
  searchIntermarcheProduct,
  extractIntermarcheProductList,
  addIntermarcheToCart,
  extractProductList,
  extractProductDetails,
  selectProduct,
  addToCart,
  getDebugLogs
  selectSuperUStore,
  searchSuperUProduct,
  extractSuperUProductList,
  addSuperUToCart,
  snapshotSuperUCartCount