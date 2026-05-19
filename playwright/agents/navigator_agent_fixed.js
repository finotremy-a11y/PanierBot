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

const INTERMARCHE_CART_SIGNALS = [
  "[data-testid*=\"cart-count\" i]",
  "[data-testid*=\"basket-count\" i]",
  "[data-testid*=\"cart\" i] [class*=\"count\" i]",
  "[data-testid*=\"cart\" i]",
  "a[href*=\"panier\" i]",
  "button[aria-label*=\"panier\" i]",
  "[class*=\"cart\" i] [class*=\"badge\" i]"
];
