#!/usr/bin/env node

import assert from "node:assert/strict";
import { retry, isRetriableError } from "./retry.js";

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

  assert.equal(isRetriableError(new Error("DOM incomplet: missing selector for product card")), true);

  assert.equal(isRetriableError(new Error("Validation error: missing input")), false);
}

async function testFatal403StopsImmediately() {
  let attempts = 0;

  await assert.rejects(
    retry(async () => {
      attempts += 1;
      const error = new Error("HTTP 403 Forbidden");
      error.status = 403;
      throw error;
    }, {
      retries: 5,
      backoff: 10,
      jitter: 0
    }),
    /HTTP 403 Forbidden/
  );

  assert.equal(attempts, 1);
}

async function testRetryAfterIsHonored() {
  let attempts = 0;
  const start = Date.now();

  const result = await retry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("HTTP 429 Too Many Requests");
      error.status = 429;
      error.retryAfterMs = 25;
      throw error;
    }

    return "retry-after-recovered";
  }, {
    retries: 2,
    backoff: 1,
    jitter: 0
  });

  assert.equal(result, "retry-after-recovered");
  assert.equal(attempts, 2);
  assert.ok(Date.now() - start >= 20);
}

async function main() {
  await testRetriesOnTimeout();
  await testFatalErrorStopsImmediately();
  await testFatal403StopsImmediately();
  await testRetriesOnHttp429();
  await testRetryAfterIsHonored();
  testRetriableDetector();
  console.log("✅ test-retry: all checks passed");
}

main().catch((error) => {
  console.error("❌ test-retry failed:", error.message);
  process.exit(1);
});
