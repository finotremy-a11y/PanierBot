#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAYWRIGHT_DIR="$ROOT_DIR/playwright"
CDP_URL="${CDP_URL:-http://localhost:9222}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
STRICT_BROWSER_AUDITS="${STRICT_BROWSER_AUDITS:-1}"
STRICT_LOAD_TESTS="${STRICT_LOAD_TESTS:-0}"
STRICT_BILLING_SECRETS="${STRICT_BILLING_SECRETS:-1}"
PRESERVE_CDP_SESSION="${PRESERVE_CDP_SESSION:-0}"
SKIP_BROWSER_AUDITS="${SKIP_BROWSER_AUDITS:-0}"
SKIP_LOAD_TESTS="${SKIP_LOAD_TESTS:-0}"
LOAD_TEST_DURATION_SEC="${LOAD_TEST_DURATION_SEC:-5}"
LOAD_MAX_API_ERROR_RATE_PERCENT="${LOAD_MAX_API_ERROR_RATE_PERCENT:-2}"
LOAD_MAX_API_P95_MS="${LOAD_MAX_API_P95_MS:-2500}"
LOAD_MIN_CDP_STABILITY_PERCENT="${LOAD_MIN_CDP_STABILITY_PERCENT:-95}"
LOAD_MAX_VUSER_FAILURE_RATE_PERCENT="${LOAD_MAX_VUSER_FAILURE_RATE_PERCENT:-2}"

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    return 1
  fi
  return 0
}

run_step() {
  local label="$1"
  shift
  printf '\n== %s ==\n' "$label"
  "$@"
}

cd "$ROOT_DIR"

run_step "RSpec" bundle exec rspec
run_step "Brakeman" bin/brakeman --no-pager
run_step "Bundler audit" bin/bundler-audit
run_step "RuboCop" bin/rubocop -f simple
run_step "JavaScript lint" npm --prefix "$ROOT_DIR" run lint
run_step "Selector coverage" npm --prefix "$PLAYWRIGHT_DIR" run test-selector-coverage

if [[ "$STRICT_BILLING_SECRETS" == "1" ]]; then
  printf '\n== Billing secrets ==\n'
  missing_keys=()
  for key in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PREMIUM_PRICE_ID; do
    if ! require_env "$key"; then
      missing_keys+=("$key")
    fi
  done

  if (( ${#missing_keys[@]} > 0 )); then
    printf 'Missing billing secrets: %s\n' "${missing_keys[*]}" >&2
    exit 1
  fi

  printf 'Stripe secrets presence check passed.\n'
fi

if [[ "$SKIP_LOAD_TESTS" == "1" ]]; then
  printf '\n== Load tests ==\nSkipped because SKIP_LOAD_TESTS=1\n'
elif ! curl -fsS "$API_BASE_URL" >/dev/null 2>&1; then
  if [[ "$STRICT_LOAD_TESTS" == "1" ]]; then
    printf '\nLoad tests require an active API endpoint at %s\n' "$API_BASE_URL" >&2
    exit 1
  fi

  printf '\n== Load tests ==\nSkipped because %s is unavailable\n' "$API_BASE_URL"
else
  run_step "Load tests" env API_BASE_URL="$API_BASE_URL" LOAD_TEST_DURATION_SEC="$LOAD_TEST_DURATION_SEC" LOAD_MAX_API_ERROR_RATE_PERCENT="$LOAD_MAX_API_ERROR_RATE_PERCENT" LOAD_MAX_API_P95_MS="$LOAD_MAX_API_P95_MS" LOAD_MIN_CDP_STABILITY_PERCENT="$LOAD_MIN_CDP_STABILITY_PERCENT" LOAD_MAX_VUSER_FAILURE_RATE_PERCENT="$LOAD_MAX_VUSER_FAILURE_RATE_PERCENT" npm --prefix "$PLAYWRIGHT_DIR" run load-test
fi

if [[ "$SKIP_BROWSER_AUDITS" == "1" ]]; then
  printf '\n== Browser audits ==\nSkipped because SKIP_BROWSER_AUDITS=1\n'
  exit 0
fi

if ! curl -fsS "$CDP_URL/json/version" >/dev/null 2>&1; then
  if [[ "$STRICT_BROWSER_AUDITS" == "1" ]]; then
    printf '\nBrowser audits require an active CDP endpoint at %s\n' "$CDP_URL" >&2
    exit 1
  fi

  printf '\n== Browser audits ==\nSkipped because %s is unavailable\n' "$CDP_URL"
  exit 0
fi

run_step "Navigator smoke test" npm --prefix "$PLAYWRIGHT_DIR" run test-navigator
run_step "Global multi-store audit" env AUDIT_ALLOW_OFFLINE_FALLBACK="false" REQUIRE_LIVE_AUDIT="1" PRESERVE_CDP_SESSION="$PRESERVE_CDP_SESSION" npm --prefix "$PLAYWRIGHT_DIR" run test-all-stores-full

printf '\nProduction readiness check completed successfully.\n'