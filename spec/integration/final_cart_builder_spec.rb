require "rails_helper"

RSpec.describe FinalCartBuilder, type: :model do
  describe "#call" do
    let(:stdout_payload) do
      {
        success: true,
        total: 12.34,
        stores: [ { store: "leclerc", subtotal: 12.34, item_count: 2 } ],
        results: [
          {
            item: "pates",
            selected_store: "leclerc",
            selected_product: {
              name: "Pates",
              price: 1.23,
              quantity: "500g",
              url: "https://example.test/pates"
            }
          }
        ],
        logs: [ "mock-playwright" ],
        errors: []
      }
    end

    it "parses PANIERBOT_JSON markers from mocked Playwright output" do
      stdout = "PANIERBOT_JSON_START\n#{stdout_payload.to_json}\nPANIERBOT_JSON_END\n"
      status = instance_double(Process::Status, success?: true)

      allow(Open3).to receive(:capture3).and_return([ stdout, "", status ])

      result = described_class.new(items: [ "pates" ], strategy: "cheapest", mode: "multi_store").call

      expect(result[:success]).to eq(true)
      expect(result[:total]).to eq(12.34)
      expect(result[:products].first[:item]).to eq("pates")
      expect(result[:logs]).to include("mock-playwright")
    end

    it "returns failure payload when bridge exits in error" do
      status = instance_double(Process::Status, success?: false)
      allow(Open3).to receive(:capture3).and_return([ "", "bridge failed", status ])

      result = described_class.new(items: [ "pates" ], strategy: "cheapest", mode: "multi_store").call

      expect(result[:success]).to eq(false)
      expect(result[:errors]).to include("bridge failed")
    end
  end
end
