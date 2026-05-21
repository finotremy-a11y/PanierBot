import { test, expect, chromium } from "@playwright/test";
import {
  normalizeProduct,
  computeDerivedPrices,
  compareProductsAcrossStores,
  buildFinalCart
} from "../agents/navigator_agent.js";

const STRATEGIES = ["cheapest", "best_per_kg", "per_unit", "best_per_l"];

function dataset() {
  return {
    leclerc: {
      pates: [
        { id: "l-p-1", name: "Pates Leclerc Eco", price: 1.79, quantity: "500g", pricePerKg: 3.58, pricePerUnit: 0.89 },
        { id: "l-p-2", name: "Pates Leclerc Family", price: 2.90, quantity: "1kg", pricePerKg: 2.90, pricePerUnit: 1.45 }
      ],
      lait: [
        { id: "l-l-1", name: "Lait Leclerc", price: 1.55, quantity: "1L", pricePerL: 1.55, pricePerUnit: 1.55 },
        { id: "l-l-2", name: "Pack Lait Leclerc x6", price: 7.80, quantity: "6", pricePerUnit: 1.30 }
      ]
    },
    carrefour: {
      pates: [
        { id: "c-p-1", name: "Pates Carrefour Bulk", price: 2.58, quantity: "1kg", pricePerKg: 2.58, pricePerUnit: 1.29 },
        { id: "c-p-2", name: "Pates Carrefour Premium", price: 1.95, quantity: "500g", pricePerKg: 3.90, pricePerUnit: 0.98 }
      ],
      lait: [
        { id: "c-l-1", name: "Lait Carrefour", price: 1.49, quantity: "1L", pricePerL: 1.49, pricePerUnit: 1.49 },
        { id: "c-l-2", name: "Pack Lait Carrefour x8", price: 6.40, quantity: "8", pricePerUnit: 0.80 }
      ]
    },
    intermarche: {
      pates: [
        { id: "i-p-1", name: "Pates Intermarche", price: 1.89, quantity: "500g", pricePerKg: 3.78, pricePerUnit: 0.95 }
      ],
      lait: [
        { id: "i-l-1", name: "Lait Intermarche", price: 1.63, quantity: "1L", pricePerL: 1.63, pricePerUnit: 1.63 }
      ]
    },
    superu: {
      pates: [
        { id: "s-p-1", name: "Pates Super U", price: 2.10, quantity: "1kg", pricePerKg: 2.10, pricePerUnit: 1.05 }
      ],
      lait: [
        { id: "s-l-1", name: "Lait Super U", price: 1.52, quantity: "1L", pricePerL: 1.52, pricePerUnit: 1.52 }
      ]
    }
  };
}

function expectedWinnerId(strategy, item) {
  const lookup = {
    pates: {
      cheapest: "l-p-1",
      best_per_kg: "s-p-1",
      per_unit: "l-p-1",
      best_per_l: null
    },
    lait: {
      cheapest: "c-l-1",
      best_per_kg: "c-l-1",
      per_unit: "c-l-2",
      best_per_l: "c-l-1"
    }
  };

  return lookup[item][strategy];
}

function createAdapters(data, trace) {
  return Object.fromEntries(Object.keys(data).map((store) => [store, {
    async search(_ctx, item) {
      trace.push(`search:${store}:${item}`);
      return { success: true };
    },
    async extract(_ctx, opts = {}) {
      const query = String(opts.query || "").toLowerCase();
      trace.push(`extract:${store}:${query}`);
      return (data[store][query] || []).map((product, index) => {
        const normalized = normalizeProduct({ ...product, store }, { store, index });
        return computeDerivedPrices(normalized);
      });
    },
    async add(_ctx, _index, payload = {}) {
      const id = payload?.product?.id || "unknown";
      trace.push(`add:${store}:${id}`);
      return { success: true, productId: id };
    }
  }]));
}

test.describe("Strategies E2E", () => {
  test.describe.configure({ timeout: 60_000 });

  for (const strategy of STRATEGIES) {
    test(`validates strategy ${strategy} with CDP + mono + multi`, async () => {
      const browser = await chromium.launch({ headless: true });
      const cdp = await browser.newBrowserCDPSession();
      const context = await browser.newContext();
      const page = await context.newPage();

      const browserVersion = await cdp.send("Browser.getVersion");
      expect(browserVersion.product).toBeTruthy();
      await page.goto("data:text/html,<html><body><h1>PanierBot Strategy E2E</h1></body></html>");
      await expect(page.locator("h1")).toHaveText("PanierBot Strategy E2E");

      const data = dataset();
      const trace = [];
      const adapters = createAdapters(data, trace);
      const primaryItem = strategy === "best_per_l" ? "lait" : "pates";

      const productLists = Object.fromEntries(Object.keys(data).map((store) => [
        store,
        (data[store][primaryItem] || []).map((product, index) => {
          const normalized = normalizeProduct({ ...product, store }, { store, index });
          return computeDerivedPrices(normalized);
        })
      ]));

      const comparison = compareProductsAcrossStores(productLists, strategy, { storeOrder: ["leclerc", "carrefour", "intermarche", "superu"] });
      expect(comparison.bestProduct).toBeTruthy();
      expect(comparison.bestProduct.id).toBe(expectedWinnerId(strategy, primaryItem));

      const multiResult = await buildFinalCart([primaryItem], strategy, "multi_store", {
        adapters,
        storeOrder: ["leclerc", "carrefour", "intermarche", "superu"]
      });

      expect(multiResult.success).toBeTruthy();
      expect(multiResult.results).toHaveLength(1);
      expect(multiResult.results[0].selectedProduct.id).toBe(expectedWinnerId(strategy, primaryItem));

      const activeStores = Object.entries(multiResult.cartByStore).filter(([, products]) => products.length > 0).map(([store]) => store);
      expect(activeStores.length).toBeGreaterThan(0);

      const singleTrace = [];
      const singleResult = await buildFinalCart([primaryItem], strategy, "single_store", {
        adapters: createAdapters(data, singleTrace),
        storeOrder: ["leclerc", "carrefour", "intermarche", "superu"]
      });

      expect(singleResult.success).toBeTruthy();
      expect(singleResult.selectedStore).toBeTruthy();
      const singleActiveStores = Object.entries(singleResult.cartByStore).filter(([, products]) => products.length > 0);
      expect(singleActiveStores).toHaveLength(1);

      const searchEvents = trace.filter((entry) => entry.startsWith("search:"));
      const extractEvents = trace.filter((entry) => entry.startsWith("extract:"));
      expect(searchEvents.length).toBeGreaterThanOrEqual(4);
      expect(extractEvents.length).toBeGreaterThanOrEqual(4);

      await context.close();
      await browser.close();
    });
  }
});