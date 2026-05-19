require "json"
require "net/http"
require "open3"

class HealthCheckService
  CDP_URL = ENV.fetch("PANIERBOT_CDP_URL", "http://localhost:9222").freeze

  def call
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    cdp = check_cdp
    playwright = check_playwright
    parsers = check_parsers
    selectors = check_selectors

    latency_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000.0).round(2)

    checks = {
      chrome_cdp: cdp,
      playwright: playwright,
      parsers: parsers,
      selectors: selectors,
      latency: {
        ok: latency_ms < 2500.0,
        latency_ms: latency_ms
      }
    }

    {
      healthy: checks.values.all? { |v| v[:ok] == true },
      timestamp: Time.current.utc.iso8601(3),
      checks: checks
    }
  end

  private

  def check_cdp
    url = URI.parse("#{CDP_URL}/json/version")
    request = Net::HTTP::Get.new(url)

    response = Net::HTTP.start(url.host, url.port, read_timeout: 2, open_timeout: 2) do |http|
      http.request(request)
    end

    body = JSON.parse(response.body)
    {
      ok: response.code.to_i == 200 && body["Browser"].present?,
      browser: body["Browser"],
      websocket: body["webSocketDebuggerUrl"]
    }
  rescue StandardError => e
    { ok: false, error: e.message }
  end

  def check_playwright
    command = ["node", "--input-type=module", "-e", "import('playwright').then(()=>console.log('ok'))"]
    _stdout, _stderr, status = Open3.capture3(*command, chdir: Rails.root.join("playwright"))

    { ok: status.success? }
  rescue StandardError => e
    { ok: false, error: e.message }
  end

  def check_parsers
    content = File.read(Rails.root.join("playwright", "agents", "navigator_agent.js"))
    required = %w[parsePrice parseQuantity parseUnit extractProductsFromHtml]
    missing = required.reject { |name| content.include?("function #{name}(") }

    {
      ok: missing.empty?,
      missing: missing
    }
  rescue StandardError => e
    { ok: false, error: e.message }
  end

  def check_selectors
    content = File.read(Rails.root.join("playwright", "agents", "navigator_agent.js"))
    has_selectors = content.include?("const SELECTORS =")
    has_store_selectors = content.include?("const SELECTORS_BY_STORE =")

    {
      ok: has_selectors && has_store_selectors,
      has_selectors: has_selectors,
      has_store_selectors: has_store_selectors
    }
  rescue StandardError => e
    { ok: false, error: e.message }
  end
end
