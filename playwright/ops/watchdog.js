import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const LOG_DIR = process.env.AGENT_LOG_DIR || "/var/log/agent";
const LOG_FILE = `${LOG_DIR}/watchdog.log`;
const CHROME_LOG_FILE = `${LOG_DIR}/chrome.log`;
const PLAYWRIGHT_LOG_FILE = `${LOG_DIR}/playwright.log`;
const HEARTBEAT_FILE = "/tmp/playwright-heartbeat.json";
const CHROME_PORT = process.env.CHROME_DEBUG_PORT || "9222";

const WATCHDOG_INTERVAL_MS = 10_000;
const HEARTBEAT_TTL_MS = 45_000;

let chromeProcess = null;
let playwrightProcess = null;
let shuttingDown = false;

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(LOG_FILE, line, "utf8");
}

async function readHeartbeatTimestampMs() {
  try {
    await readFile(HEARTBEAT_FILE, { encoding: "utf8", flag: fsConstants.R_OK });
    const raw = await readFile(HEARTBEAT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Number(parsed.timestampMs) || 0;
  } catch {
    return 0;
  }
}

function pipeProcessLogs(child, outputFile) {
  child.stdout?.on("data", (chunk) => {
    appendFile(outputFile, chunk.toString("utf8")).catch(() => {});
  });

  child.stderr?.on("data", (chunk) => {
    appendFile(outputFile, chunk.toString("utf8")).catch(() => {});
  });
}

function spawnChrome() {
  const args = [
    "--headless=new",
    `--remote-debugging-port=${CHROME_PORT}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--user-data-dir=/tmp/chrome-profile",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ];

  chromeProcess = spawn("google-chrome-stable", args, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  pipeProcessLogs(chromeProcess, CHROME_LOG_FILE);

  chromeProcess.on("exit", (code, signal) => {
    const details = `chrome exited code=${code ?? "null"} signal=${signal ?? "null"}`;
    log(details).catch(() => {});
    chromeProcess = null;

    if (!shuttingDown) {
      setTimeout(() => {
        log("restarting chrome after crash").catch(() => {});
        spawnChrome();
      }, 1500);
    }
  });

  log("chrome started with remote debugging").catch(() => {});
}

function spawnPlaywrightProbe() {
  playwrightProcess = spawn("node", ["/rails/playwright/ops/playwright_probe_worker.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      AGENT_LOG_DIR: LOG_DIR,
      CHROME_DEBUG_PORT: CHROME_PORT,
      HEARTBEAT_FILE
    }
  });

  pipeProcessLogs(playwrightProcess, PLAYWRIGHT_LOG_FILE);

  playwrightProcess.on("exit", (code, signal) => {
    const details = `playwright probe exited code=${code ?? "null"} signal=${signal ?? "null"}`;
    log(details).catch(() => {});
    playwrightProcess = null;

    if (!shuttingDown) {
      setTimeout(() => {
        log("restarting playwright probe after crash").catch(() => {});
        spawnPlaywrightProbe();
      }, 1500);
    }
  });

  log("playwright probe started").catch(() => {});
}

async function restartPlaywrightProbe(reason) {
  await log(`restarting playwright probe: ${reason}`);
  if (playwrightProcess && !playwrightProcess.killed) {
    playwrightProcess.kill("SIGKILL");
  }
  spawnPlaywrightProbe();
}

async function watchdogTick() {
  if (!chromeProcess) {
    await log("chrome missing, starting process");
    spawnChrome();
  }

  if (!playwrightProcess) {
    await log("playwright probe missing, starting process");
    spawnPlaywrightProbe();
  }

  const heartbeat = await readHeartbeatTimestampMs();
  const staleMs = Date.now() - heartbeat;

  if (!heartbeat || staleMs > HEARTBEAT_TTL_MS) {
    await restartPlaywrightProbe(`heartbeat stale (${staleMs}ms)`);
  }
}

async function shutdown() {
  shuttingDown = true;
  await log("shutdown requested");

  if (playwrightProcess && !playwrightProcess.killed) {
    playwrightProcess.kill("SIGTERM");
  }

  if (chromeProcess && !chromeProcess.killed) {
    chromeProcess.kill("SIGTERM");
  }

  setTimeout(() => process.exit(0), 1000);
}

async function bootstrap() {
  await mkdir(LOG_DIR, { recursive: true });
  await rm(HEARTBEAT_FILE, { force: true });
  await log("watchdog bootstrap");

  spawnChrome();
  spawnPlaywrightProbe();

  setInterval(() => {
    watchdogTick().catch((error) => {
      log(`watchdog tick error: ${error.message}`).catch(() => {});
    });
  }, WATCHDOG_INTERVAL_MS);

  process.on("SIGTERM", () => {
    shutdown().catch(() => process.exit(1));
  });

  process.on("SIGINT", () => {
    shutdown().catch(() => process.exit(1));
  });
}

bootstrap().catch(async (error) => {
  await mkdir(LOG_DIR, { recursive: true });
  await log(`watchdog fatal error: ${error.message}`);
  process.exit(1);
});
