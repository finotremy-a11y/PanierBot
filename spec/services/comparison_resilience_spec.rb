require "rails_helper"

RSpec.describe ComparisonResilience do
  around do |example|
    previous_cache_flag = ENV["ENABLE_COMPARISON_CACHE_IN_TEST"]
    previous_queue_flag = ENV["ENABLE_QUEUE_SLOT_IN_TEST"]
    previous_throttle_flag = ENV["ENABLE_COMPARISON_THROTTLE_IN_TEST"]
    ENV["ENABLE_COMPARISON_CACHE_IN_TEST"] = "1"
    ENV["ENABLE_QUEUE_SLOT_IN_TEST"] = "1"
    ENV["ENABLE_COMPARISON_THROTTLE_IN_TEST"] = "1"
    cache = described_class.send(:cache_store)
    cache.clear if cache.respond_to?(:clear)
    example.run
    cache.clear if cache.respond_to?(:clear)
    ENV["ENABLE_COMPARISON_CACHE_IN_TEST"] = previous_cache_flag
    ENV["ENABLE_QUEUE_SLOT_IN_TEST"] = previous_queue_flag
    ENV["ENABLE_COMPARISON_THROTTLE_IN_TEST"] = previous_throttle_flag
  end

  describe ".build_signature" do
    it "is order-insensitive for items" do
      first = described_class.build_signature(items: [ "lait", "pates" ], strategy: "cheapest", mode: "multi_store", city: "Paris")
      second = described_class.build_signature(items: [ "pates", "lait" ], strategy: "cheapest", mode: "multi_store", city: "Paris")

      expect(first).to eq(second)
    end
  end

  describe "cache namespace isolation" do
    it "keeps api and web payloads separated" do
      signature = described_class.build_signature(items: [ "lait" ], strategy: "cheapest", mode: "multi_store", city: "Paris")

      described_class.write_cached_result(signature, { success: true, marker: "api" }, namespace: "api")
      described_class.write_cached_result(signature, { success: true, marker: "web" }, namespace: "web")

      expect(described_class.fetch_cached_result(signature, namespace: "api")[:marker]).to eq("api")
      expect(described_class.fetch_cached_result(signature, namespace: "web")[:marker]).to eq("web")
    end
  end

  describe ".allow_request?" do
    it "throttles after the configured limit" do
      allow_1 = described_class.allow_request?(scope: "spec", identifier: "u1", limit: 2, period: 5.seconds)
      allow_2 = described_class.allow_request?(scope: "spec", identifier: "u1", limit: 2, period: 5.seconds)
      allow_3 = described_class.allow_request?(scope: "spec", identifier: "u1", limit: 2, period: 5.seconds)

      expect(allow_1).to eq(true)
      expect(allow_2).to eq(true)
      expect(allow_3).to eq(false)
    end
  end

  describe "queue slots" do
    it "acquires and releases slots" do
      expect(described_class.acquire_queue_slot(max_inflight: 1)).to eq(true)
      expect(described_class.acquire_queue_slot(max_inflight: 1)).to eq(false)

      described_class.release_queue_slot

      expect(described_class.acquire_queue_slot(max_inflight: 1)).to eq(true)
      described_class.release_queue_slot
    end
  end
end
