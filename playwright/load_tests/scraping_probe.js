import { decideNextAction, extractProductsFromHtml } from "../agents/navigator_agent.js";

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(2));
}

function summarizeLatencies(latencies) {
  if (!latencies.length) {
    return {
      count: 0,
      minMs: 0,
      maxMs: 0,
      avgMs: 0,
      p95Ms: 0
    };
  }

  const total = latencies.reduce((sum, value) => sum + value, 0);
  return {
    count: latencies.length,
    minMs: Number(Math.min(...latencies).toFixed(2)),
    maxMs: Number(Math.max(...latencies).toFixed(2)),
    avgMs: Number((total / latencies.length).toFixed(2)),
    p95Ms: percentile(latencies, 95)
  };
}

function buildSyntheticHtml() {
  const products = Array.from({ length: 30 }, (_, index) => {
    const i = index + 1;
    return `
      <article class="product-card" data-testid="product-${i}">
        <h3 class="product-name">Produit ${i}</h3>
        <div class="price">${(1 + i * 0.17).toFixed(2).replace(".", ",")} €</div>
        <div class="unit-price">${(2 + i * 0.11).toFixed(2).replace(".", ",")} €/kg</div>
        <button aria-label="Ajouter au panier">Ajouter au panier</button>
      </article>
    `;
  }).join("\n");

  return `
    <html>
      <body>
        <header>
          <input type="search" placeholder="recherche produit" />
          <button type="submit" aria-label="recherche">Rechercher</button>
        </header>
        <main>
          ${products}
        </main>
      </body>
    </html>
  `;
}

export async function runScrapingProbe({ users, durationSec }) {
  const endAt = Date.now() + durationSec * 1000;
  const html = buildSyntheticHtml();

  let operations = 0;
  let errors = 0;
  const latencies = [];

  const worker = async (workerId) => {
    const remainingItems = ["lait", "pates", `fromage-${workerId}`];

    while (Date.now() < endAt) {
      const started = process.hrtime.bigint();
      try {
        const action = decideNextAction({
          html,
          url: "https://www.leclercdrive.fr/recherche",
          remainingItems,
          strategy: "cheapest",
          store: "leclerc"
        });

        if (!action || typeof action !== "object") {
          throw new Error("Invalid action payload");
        }

        const extracted = extractProductsFromHtml(html);
        if (!Array.isArray(extracted)) {
          throw new Error("Invalid extract payload");
        }

        operations += 1;
      } catch (error) {
        errors += 1;
      } finally {
        const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
        latencies.push(elapsed);
      }

      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  await Promise.all(Array.from({ length: users }, (_, index) => worker(index + 1)));

  const summary = summarizeLatencies(latencies);
  const errorRate = summary.count > 0 ? Number(((errors / summary.count) * 100).toFixed(2)) : 0;

  return {
    users,
    durationSec,
    operations,
    errors,
    errorRate,
    latency: summary
  };
}
