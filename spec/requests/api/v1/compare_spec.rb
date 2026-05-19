require "rails_helper"

RSpec.describe "Api::V1::Compare", type: :request do
  let(:headers) do
    {
      "CONTENT_TYPE" => "application/json",
      "X-API-Key" => "test-api-key"
    }
  end

  describe "POST /api/v1/compare" do
    it "returns cart comparison payload" do
      allow_any_instance_of(FinalCartBuilder).to receive(:call).and_return(
        {
          success: true,
          products: [
            { item: "pates", store: "carrefour", name: "Pates 500g", price: 1.1 }
          ],
          total: 1.1,
          totals_by_store: { "carrefour" => 1.1 },
          stores: [{ store: "carrefour", item_count: 1, subtotal: 1.1 }],
          logs: ["buildFinalCart called"],
          errors: []
        }
      )

      post "/api/v1/compare",
        params: {
          items: ["pates"],
          strategy: "cheapest",
          mode: "multi_store"
        }.to_json,
        headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["success"]).to eq(true)
      expect(body["products"].first["store"]).to eq("carrefour")
      expect(body.dig("prices", "total")).to eq(1.1)
      expect(body["logs"]).to include("buildFinalCart called")
    end

    it "validates parameters" do
      post "/api/v1/compare",
        params: {
          items: [],
          strategy: "unknown",
          mode: "multi_store"
        }.to_json,
        headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(JSON.parse(response.body)["error"]).to include("items")
    end

    it "requires API key" do
      post "/api/v1/compare",
        params: {
          items: ["pates"],
          strategy: "cheapest",
          mode: "multi_store"
        }.to_json,
        headers: { "CONTENT_TYPE" => "application/json" }

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
