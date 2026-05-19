require "json"
require "open3"

class FinalCartBuilder
  SCRIPT_RELATIVE_PATH = File.join("playwright", "build_final_cart_bridge.js").freeze

  def initialize(items:, strategy:, mode:, city: "Paris", max_retries: 4)
    @items = Array(items).map(&:to_s).map(&:strip).reject(&:blank?)
    @strategy = strategy.to_s
    @mode = mode.to_s
    @city = city.to_s
    @max_retries = Integer(max_retries)
  end

  def call
    stdout, stderr, status = Open3.capture3(*command)

    unless status.success?
      return failure_response([stderr.presence || "Playwright bridge execution failed"])
    end

    payload = extract_payload(stdout)
    return failure_response(["Invalid JSON payload from Playwright bridge"]) if payload.blank?

    build_response(payload)
  rescue StandardError => e
    failure_response([e.message])
  end

  private

  def command
    [
      "node",
      Rails.root.join(SCRIPT_RELATIVE_PATH).to_s,
      "--items", @items.join(","),
      "--strategy", @strategy,
      "--mode", @mode,
      "--city", @city,
      "--max-retries", @max_retries.to_s
    ]
  end

  def extract_payload(stdout)
    marker = stdout.to_s.match(/PANIERBOT_JSON_START\n(.*?)\nPANIERBOT_JSON_END/m)
    return nil unless marker

    JSON.parse(marker[1], symbolize_names: true)
  rescue JSON::ParserError
    nil
  end

  def build_response(payload)
    results = Array(payload[:results])
    stores = Array(payload[:stores])

    products = results.map do |entry|
      {
        item: entry[:item],
        store: entry[:selected_store],
        name: entry.dig(:selected_product, :name),
        price: entry.dig(:selected_product, :price),
        quantity: entry.dig(:selected_product, :quantity),
        url: entry.dig(:selected_product, :url)
      }
    end

    totals_by_store = stores.each_with_object({}) do |store_entry, acc|
      acc[store_entry[:store]] = store_entry[:subtotal]
    end

    {
      success: payload[:success] == true,
      products: products,
      total: payload[:total],
      totals_by_store: totals_by_store,
      stores: stores,
      logs: Array(payload[:logs]),
      errors: Array(payload[:errors])
    }
  end

  def failure_response(errors)
    {
      success: false,
      products: [],
      total: nil,
      totals_by_store: {},
      stores: [],
      logs: [],
      errors: Array(errors)
    }
  end
end
