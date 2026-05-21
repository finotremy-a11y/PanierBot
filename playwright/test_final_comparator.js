#!/usr/bin/env node

import {
  filterProducts,
  sortProductsByStrategy,
  compareProductsAcrossStores,
  buildFinalCart,
  normalizeItems,
  normalizeProduct
} from "./agents/navigator_agent.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function log(message) {
  console.log(`[final-comparator] ${message}`);
}

function createStoreData() {
  return {
    leclerc: {
      pâtes: [
        { name: "Pâtes L raw", price: 1.6, quantity: "500g", availability: "disponible", id: "l-pates-raw", url: "l-raw" },
        { name: "Pâtes L best", price: 1.1, quantity: "500g", availability: "disponible", id: "l-pates-best", url: "l-best" },
        { name: "Pâtes L out", price: 0.9, quantity: "500g", availability: "indisponible", id: "l-pates-out", url: "l-out" }
      ],
      lait: [
        { name: "Lait L raw", price: 1.3, quantity: "1L", availability: "disponible", id: "l-lait-raw", url: "l-lait-raw" },
        { name: "Lait L best", price: 0.98, quantity: "1L", availability: "disponible", id: "l-lait-best", url: "l-lait-best" }
      ]
    },
    carrefour: {
      pâtes: [
        { name: "Pâtes C raw", price: 1.4, quantity: "500g", availability: "disponible", id: "c-pates-raw", url: "c-raw" },
        { name: "Pâtes C best", price: 1.02, quantity: "500g", availability: "disponible", id: "c-pates-best", url: "c-best" }
      ],
      lait: [
        { name: "Lait C raw", price: 1.15, quantity: "1L", availability: "disponible", id: "c-lait-raw", url: "c-lait-raw" },
        { name: "Lait C best", price: 0.91, quantity: "1L", availability: "disponible", id: "c-lait-best", url: "c-lait-best" }
      ]
    },
    intermarche: {
      pâtes: [
        { name: "Pâtes I raw", price: 1.7, quantity: "500g", availability: "disponible", id: "i-pates-raw", url: "i-raw" },
        { name: "Pâtes I best", price: 1.09, quantity: "500g", availability: "disponible", id: "i-pates-best", url: "i-best" }
      ],
      lait: [
        { name: "Lait I raw", price: 1.2, quantity: "1L", availability: "disponible", id: "i-lait-raw", url: "i-lait-raw" },
        { name: "Lait I best", price: 0.96, quantity: "1L", availability: "disponible", id: "i-lait-best", url: "i-lait-best" }
      ]
    },
    superu: {
      pâtes: [
        { name: "Pâtes S raw", price: 1.55, quantity: "500g", availability: "disponible", id: "s-pates-raw", url: "s-raw" },
        { name: "Pâtes S best", price: 1.04, quantity: "500g", availability: "disponible", id: "s-pates-best", url: "s-best" }
      ],
      lait: [
        { name: "Lait S raw", price: 1.1, quantity: "1L", availability: "disponible", id: "s-lait-raw", url: "s-lait-raw" },
        { name: "Lait S best", price: 0.94, quantity: "1L", availability: "disponible", id: "s-lait-best", url: "s-lait-best" }
      ]
    }
  };
}

function buildAdapters(storeData, counters) {
  return Object.fromEntries(Object.keys(storeData).map((store) => {
    return [store, {
      search: async (_ctx, item) => {
        counters.search[store] += 1;
        counters.searchedItems.push({ store, item });
        return { success: true };
      },
      extract: async (_ctx, args) => {
        const item = String(args?.query || "").toLowerCase();
        const data = storeData[store][item] || [];
        return data.map((product, index) => ({
          ...product,
          id: index === 0 ? `${product.id}-raw` : product.id
        }));
      },
      add: async (_ctx, index, payload) => {
        counters.add[store] += 1;
        counters.addIndex[store].push(index);
        counters.added.push({ store, index, productId: payload?.product?.id || null });
        return { success: true, index, productId: payload?.product?.id || null };
      }
    }];
  }));
}

function buildCounters() {
  return {
    search: { leclerc: 0, carrefour: 0, intermarche: 0, superu: 0 },
    add: { leclerc: 0, carrefour: 0, intermarche: 0, superu: 0 },
    addIndex: { leclerc: [], carrefour: [], intermarche: [], superu: [] },
    searchedItems: [],
    added: []
  };
}

function runHelpersAudit() {
  log("🔎 Filtrage");

  const normalizedItems = normalizeItems(" pâtes\n,lait, pâtes , oeufs ");
  assert(JSON.stringify(normalizedItems) === JSON.stringify(["pâtes", "lait", "oeufs"]), "normalizeItems doit nettoyer, découper et dédupliquer les entrées texte");

  const kgProducts = [
    normalizeProduct({ name: "Kg A", price: 2.4, quantity: "1kg", pricePerKg: 2.4, availability: "disponible", id: "kg-a", url: "kg-a" }, { store: "test", index: 0 }),
    normalizeProduct({ name: "Kg B", price: 1.1, quantity: "500g", pricePerKg: 2.2, availability: "disponible", id: "kg-b", url: "kg-b" }, { store: "test", index: 1 }),
    normalizeProduct({ name: "Kg Hidden", price: 1.7, quantity: "1kg", pricePerKg: 1.7, availability: "indisponible", id: "kg-hidden", url: "kg-hidden" }, { store: "test", index: 2 })
  ];

  const unitProducts = [
    normalizeProduct({ name: "Unit A", price: 2.0, quantity: "2", pricePerUnit: 1.0, availability: "disponible", id: "unit-a", url: "unit-a" }, { store: "test", index: 0 }),
    normalizeProduct({ name: "Unit B", price: 1.5, quantity: "3", pricePerUnit: 0.5, availability: "disponible", id: "unit-b", url: "unit-b" }, { store: "test", index: 1 }),
    normalizeProduct({ name: "Unit Missing", price: 0.8, availability: "disponible", id: "unit-missing", url: "unit-missing" }, { store: "test", index: 2 })
  ];

  const filteredKg = filterProducts(kgProducts, "best_per_kg", { storeName: "test" });
  assert(filteredKg.every((product) => Number.isFinite(product.pricePerKg)), "best_per_kg doit filtrer les produits sans prix/kg");
  assert(!filteredKg.some((product) => product.id === "kg-hidden"), "best_per_kg doit filtrer les produits hors stock");

  const filteredUnit = filterProducts(unitProducts, "per_unit", { storeName: "test" });
  assert(!filteredUnit.some((product) => product.id === "unit-missing"), "per_unit doit filtrer les produits sans quantité");

  log("📊 Tri");
  const cheapestProducts = [
    normalizeProduct({ name: "Cheap A", price: 1.8, quantity: "500g", availability: "disponible", id: "cheap-a", url: "cheap-a" }, { store: "test", index: 0 }),
    normalizeProduct({ name: "Cheap B", price: 0.9, quantity: "500g", availability: "disponible", id: "cheap-b", url: "cheap-b" }, { store: "test", index: 1 })
  ];
  const sortedCheapest = sortProductsByStrategy(cheapestProducts, "cheapest", { storeName: "test" });
  assert(sortedCheapest[0].id === "cheap-b", "Le tri cheapest doit mettre le produit le moins cher en premier");

  const sortedPerKg = sortProductsByStrategy(filteredKg, "best_per_kg", { storeName: "test" });
  assert(sortedPerKg[0].id === "kg-b", "Le tri best_per_kg doit utiliser pricePerKg");

  const sortedPerUnit = sortProductsByStrategy(filteredUnit, "per_unit", { storeName: "test" });
  assert(sortedPerUnit[0].id === "unit-b", "Le tri per_unit doit utiliser pricePerUnit");
}

async function runComparatorAudit() {
  const storeData = createStoreData();
  const counters = buildCounters();
  const adapters = buildAdapters(storeData, counters);

  const itemLists = {
    leclerc: storeData.leclerc.pâtes.map((product, index) => normalizeProduct(product, { store: "leclerc", index })),
    carrefour: storeData.carrefour.pâtes.map((product, index) => normalizeProduct(product, { store: "carrefour", index })),
    intermarche: storeData.intermarche.pâtes.map((product, index) => normalizeProduct(product, { store: "intermarche", index })),
    superu: storeData.superu.pâtes.map((product, index) => normalizeProduct(product, { store: "superu", index }))
  };

  log("🏆 Sélection");
  const comparison = compareProductsAcrossStores(itemLists, "cheapest", { logs: [] });
  assert(comparison.bestProduct?.store === "carrefour", "La comparaison globale doit sélectionner le meilleur produit cross-store");

  const multiResult = await buildFinalCart("pâtes\n,lait, pâtes", "cheapest", "multi_store", {
    adapters,
    logs: []
  });

  assert(multiResult.success === true, "Le mode multi_store doit réussir");
  assert(multiResult.cartByStore.carrefour.length > 0, "Le panier multi_store doit remplir au moins une enseigne");
  assert(multiResult.total > 0, "Le panier multi_store doit avoir un total positif");
  assert(counters.search.leclerc === 2 && counters.search.carrefour === 2 && counters.search.intermarche === 2 && counters.search.superu === 2, "Chaque enseigne doit être interrogée pour chaque item");

  const singleCounters = buildCounters();
  const singleAdapters = buildAdapters(storeData, singleCounters);
  const singleResult = await buildFinalCart(["pâtes", "lait"], "cheapest", "single_store", {
    adapters: singleAdapters,
    logs: []
  });

  assert(singleResult.success === true, "Le mode single_store doit réussir");
  assert(typeof singleResult.selectedStore === "string" && singleResult.selectedStore.length > 0, "Le mode single_store doit choisir une enseigne");
  const activeStores = Object.entries(singleResult.cartByStore).filter(([, items]) => items.length > 0).length;
  assert(activeStores === 1, "Le mode single_store ne doit remplir qu’une seule enseigne");
  assert(singleResult.total > 0, "Le panier final doit être positif");

  const firstAdded = singleCounters.added[0] || null;
  assert(firstAdded && !String(firstAdded.productId || "").endsWith("-raw"), "Le comparateur ne doit jamais sélectionner le premier produit brut");

  log("🧺 Panier final construit");
}

async function main() {
  runHelpersAudit();
  await runComparatorAudit();
  console.log("🏆 Comparateur final multi‑enseignes opérationnel");
}

main().catch((error) => {
  console.error(`[final-comparator] ❌ ${error.message}`);
  process.exit(1);
});