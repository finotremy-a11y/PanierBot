require "rails_helper"

RSpec.describe "Api::V1::Health", type: :request do
  let(:headers) { { "X-API-Key" => "test-api-key" } }

  it "returns degraded status when a dependency is down" do
    allow_any_instance_of(HealthCheckService).to receive(:call).and_return(
      {
        healthy: false,
        checks: {
          chrome_cdp: { ok: false, error: "connection refused" },
          playwright: { ok: true },
          parsers: { ok: true },
          selectors: { ok: true },
          latency: { ok: true, latency_ms: 120 }
        }
      }
    )

    get "/api/v1/health", headers: headers

    expect(response).to have_http_status(:service_unavailable)
    body = JSON.parse(response.body)
    expect(body["healthy"]).to eq(false)
    expect(body.dig("checks", "chrome_cdp", "ok")).to eq(false)
  end
end
