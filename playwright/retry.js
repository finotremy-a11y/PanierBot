const DEFAULT_RETRY_OPTIONS = Object.freeze({
  retries: 5,
  backoff: 700,
  jitter: 0.2,
  fatalErrors: [403, /captcha/i]
});

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const RETRYABLE_MESSAGE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /etimedout/i,
  /navigation timeout/i,
  /navigation .* interrupted/i,
  /navigation .* failed/i,
  /net::err/i,
  /failed to load/i,
  /failed to fetch/i,
  /execution context was destroyed/i,
  /target page, context or browser has been closed/i,
  /socket hang up/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /network/i,
  /service unavailable/i,
  /too many requests/i,
  /dom incomplet/i,
  /dom incomplete/i,
  /incomplete dom/i,
  /missing selector/i,
  /selector .* not found/i,
  /catalogue non charge/i,
  /catalog not loaded/i,
  /resultats? incomplets?/i,
  /page vide ou html indisponible/i,
  /panier non mis a jour/i,
  /panier non mis à jour/i
];

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
  const directStatus = Number(
    error?.status
      ?? error?.statusCode
      ?? error?.response?.status
      ?? error?.cause?.status
  );
  if (Number.isFinite(directStatus)) {
    return directStatus;
  }

  const message = String(error?.message || error || "");
  const statusMatch = message.match(/\b(403|408|425|429|500|502|503|504)\b/);
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

function isDomIncompleteError(error) {
  const message = String(error?.message || error || "");
  return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isRetriableError(error) {
  const status = extractStatusCode(error);
  if (status !== null && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  return isTimeoutError(error) || isNavigationError(error) || isDomIncompleteError(error);
}

function matchesFatalMatcher(error, matcher) {
  if (!matcher) {
    return false;
  }

  if (typeof matcher === "number") {
    return extractStatusCode(error) === matcher;
  }

  if (typeof matcher === "function") {
    try {
      return matcher(error) === true;
    } catch (_) {
      return false;
    }
  }

  const message = String(error?.message || error || "");
  if (matcher instanceof RegExp) {
    return matcher.test(message);
  }

  return message.toLowerCase().includes(String(matcher).toLowerCase());
}

function isFatalError(error, fatalErrors = []) {
  const safeFatalErrors = Array.isArray(fatalErrors) ? fatalErrors : [];
  return safeFatalErrors.some((matcher) => matchesFatalMatcher(error, matcher));
}

function computeDelay(attemptNumber, backoff, jitter, error) {
  const safeBackoff = Math.max(0, Number(backoff) || 0);
  const safeJitter = Math.max(0, Number(jitter) || 0);
  const retryAfterHeader = Number(error?.retryAfterMs ?? error?.retryAfter ?? error?.response?.headers?.["retry-after"]);
  const retryAfterMs = Number.isFinite(retryAfterHeader)
    ? retryAfterHeader > 1000 ? retryAfterHeader : retryAfterHeader * 1000
    : null;
  const exponential = safeBackoff * Math.pow(2, Math.max(0, attemptNumber - 1));
  const randomFactor = 1 + ((Math.random() * 2 - 1) * safeJitter);
  const computed = Math.max(0, Math.round(exponential * randomFactor));

  if (retryAfterMs !== null) {
    return Math.max(computed, Math.round(retryAfterMs));
  }

  return computed;
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
      const suffix = status ? ` (HTTP ${status})` : "";
      console.log(`🔁 Retry #${retryNumber}${suffix}`);

      const delay = computeDelay(retryNumber, backoff, jitter, error);
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