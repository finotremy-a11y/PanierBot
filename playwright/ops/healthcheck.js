import net from "node:net";
import { chromium } from "playwright";

const CHROME_PORT = Number(process.env.CHROME_DEBUG_PORT || 9222);
const CDP_URL = `http://127.0.0.1:${CHROME_PORT}`;

const EXTRACTION_SAMPLE = `
  <article class="product-card">
    <h3>Pates Penne 500g</h3>
    <div class="price">1,99 €</div>
    <button>Ajouter au panier</button>
  </article>
`;

function waitForSocket(host, port, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const onError = (error) => {
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs);
    socket.once("error", onError);
    socket.once("timeout", () => onError(new Error("socket timeout")));
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

async function checkChromeAccessible() {
  await waitForSocket("127.0.0.1", CHROME_PORT);
}

async function checkCdp() {
  const response = await fetch(`${CDP_URL}/json/version`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`cdp status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.Browser || !payload.webSocketDebuggerUrl) {
    throw new Error("cdp payload missing Browser/webSocketDebuggerUrl");
  }

  const browser = await chromium.connectOverCDP(CDP_URL);
  await browser.close();
}

async function checkExtraction() {
  const navigatorModule = await import("/rails/playwright/agents/navigator_agent.js");
  const products = navigatorModule.extractProductsFromHtml(EXTRACTION_SAMPLE, "leclerc");

  if (!Array.isArray(products) || products.length < 1) {
    throw new Error("extraction test failed");
  }
}

async function main() {
  await checkChromeAccessible();
  await checkCdp();
  await checkExtraction();
  process.stdout.write("ok\n");
}

main().catch((error) => {
  process.stderr.write(`healthcheck failed: ${error.message}\n`);
  process.exit(1);
});
