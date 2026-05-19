#!/usr/bin/env node

import assert from "node:assert/strict";
import { retry, isRetriableError } from "./agents/retry.js";

async function testRetriesOnTimeout() {
  let attempts = 0;

  const result = await retry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("Navigation timeout exceeded");
    }
    return "ok";
  }, {
    retries: 4,
    backoff: 10,
    jitter: 0
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
}

async function testFatalErrorStopsImmediately() {
  let attempts = 0;

  await assert.rejects(
    retry(async () => {
      attempts += 1;
      throw new Error("Captcha challenge required");
    }, {
      retries: 4,
      backoff: 10,
      jitter: 0,
      fatalErrors: [/captcha/i]
    }),
    /Captcha challenge required/
  );

  assert.equal(attempts, 1);
}

async function testRetriesOnHttp429() {
  let attempts = 0;

  const result = await retry(async () => {
    attempts += 1;
    if (attempts < 2) {
      const error = new Error("HTTP 429 Too Many Requests");
      error.status = 429;
      throw error;
    }
    return "rate-limit-recovered";
  }, {
    retries: 3,
    backoff: 10,
    jitter: 0
  });

  assert.equal(result, "rate-limit-recovered");
  assert.equal(attempts, 2);
}

function testRetriableDetector() {
  assert.equal(isRetriableError(new Error("Navigation timeout exceeded")), true);

  const err503 = new Error("Service unavailable");
  err503.status = 503;
  assert.equal(isRetriableError(err503), true);

  assert.equal(isRetriableError(new Error("Validation error: missing input")), false);
}

async function main() {
  await testRetriesOnTimeout();
  await testFatalErrorStopsImmediately();
  await testRetriesOnHttp429();
  testRetriableDetector();
  console.log("✅ test-retry: all checks passed");
}

main().catch((error) => {
  console.error("❌ test-retry failed:", error.message);
  process.exit(1);
});
