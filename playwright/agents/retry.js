const DEFAULT_RETRY_OPTIONS = Object.freeze({
  retries: 3,
  backoff: 700,
  jitter: 0.2,
  fatalErrors: []
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function normalizeError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error || "Unknown error"));
}

function extractStatusCode(error) {
  const directStatus = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (Number.isFinite(directStatus)) {
    return directStatus;
  }

  const message = String(error?.message || error || "");
  const statusMatch = message.match(/\b(429|503)\b/);
  return statusMatch ? Number(statusMatch[1]) : null;
}

function isTimeoutError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("timeout")
    || message.includes("timed out")
    || message.includes("etimedout")
    || message.includes("navigation timeout");
}

function isNavigationError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("navigation")
    || message.includes("net::err")
    || message.includes("execution context was destroyed")
    || message.includes("target page, context or browser has been closed")
    || message.includes("failed to load")
    || message.includes("failed to fetch");
}

function isRetriableError(error) {
  const status = extractStatusCode(error);
  if (status === 429 || status === 503) {
    return true;
  }

  return isTimeoutError(error) || isNavigationError(error);
}

function isFatalError(error, fatalErrors = []) {
  const message = String(error?.message || error || "");
  const safeFatalErrors = Array.isArray(fatalErrors) ? fatalErrors : [];

  return safeFatalErrors.some((matcher) => {
    if (!matcher) {
      return false;
    }

    if (typeof matcher === "function") {
      try {
        return matcher(error) === true;
      } catch (_) {
        return false;
      }
    }

    if (matcher instanceof RegExp) {
      return matcher.test(message);
    }

    return message.toLowerCase().includes(String(matcher).toLowerCase());
  });
}

function computeDelay(attemptNumber, backoff, jitter) {
  const safeBackoff = Math.max(0, Number(backoff) || 0);
  const safeJitter = Math.max(0, Number(jitter) || 0);
  const exponential = safeBackoff * Math.pow(2, Math.max(0, attemptNumber - 1));
  const randomFactor = 1 + ((Math.random() * 2 - 1) * safeJitter);
  return Math.max(0, Math.round(exponential * randomFactor));
}

async function retry(fn, options = {}) {
  const retries = Math.max(0, Number(options.retries ?? DEFAULT_RETRY_OPTIONS.retries) || 0);
  const backoff = Math.max(0, Number(options.backoff ?? DEFAULT_RETRY_OPTIONS.backoff) || 0);
  const jitter = Math.max(0, Number(options.jitter ?? DEFAULT_RETRY_OPTIONS.jitter) || 0);
  const fatalErrors = Array.isArray(options.fatalErrors) ? options.fatalErrors : DEFAULT_RETRY_OPTIONS.fatalErrors;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn({ attempt, maxRetries: retries });
    } catch (errorLike) {
      const error = normalizeError(errorLike);

      if (isFatalError(error, fatalErrors)) {
        console.error(`❌ Fatal error: ${error.message}`);
        throw error;
      }

      const shouldRetry = attempt < retries && isRetriableError(error);
      if (!shouldRetry) {
        throw error;
      }

      const retryNumber = attempt + 1;
      const status = extractStatusCode(error);
      if (status === 429) {
        console.log(`🔁 Retry #${retryNumber} (HTTP 429)`);
      } else if (status === 503) {
        console.log(`🔁 Retry #${retryNumber} (HTTP 503)`);
      } else {
        console.log(`🔁 Retry #${retryNumber}`);
      }

      const delay = computeDelay(retryNumber, backoff, jitter);
      console.log(`⏳ Backoff ${delay}ms`);
      await sleep(delay);
    }
  }

  throw new Error("Retry exhausted");
}

export {
  retry,
  isRetriableError
};