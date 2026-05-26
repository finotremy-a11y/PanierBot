require "rails_helper"
require "json"

RSpec.describe "Comparaison par strategie", type: :system do
  include ActiveJob::TestHelper
  include Warden::Test::Helpers

  STRATEGIES = {
    cheapest: "Moins cher",
    best_per_kg: "Meilleur prix/kg",
    per_unit: "Prix/unite",
    best_per_l: "Prix/L"
  }.freeze

  before do
    driven_by(:rack_test)

    Warden.test_mode!
    clear_enqueued_jobs
    clear_performed_jobs
    @original_adapter = ActiveJob::Base.queue_adapter
    @memory_cache = ActiveSupport::Cache::MemoryStore.new
    ActiveJob::Base.queue_adapter = :test
    allow(Rails).to receive(:cache).and_return(@memory_cache)

    user = User.create!(
      email: "strategies-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      plan: "premium",
      subscription_status: "active"
    )
    login_as(user, scope: :user)

    allow_any_instance_of(ComparisonBuilder).to receive(:call) do |builder|
      strategy = builder.instance_variable_get(:@strategy)
      mode = builder.instance_variable_get(:@mode)
      items = builder.instance_variable_get(:@items)
      store = builder.instance_variable_get(:@store)

      build_stubbed_result(
        mode: mode,
        strategy: strategy,
        items: items,
        store: store
      )
    end
  end

  after do
    ActiveJob::Base.queue_adapter = @original_adapter
    Warden.test_reset!
  end

  context "mono-enseigne" do
    STRATEGIES.each do |strategy, label|
      it "valide #{strategy} en mode single_store" do
        launch_comparison(mode: "single_store", store: "leclerc", strategy: strategy)

        expect(page).to have_content("Résultats de comparaison")
        expect(page).to have_content("Mono-enseigne")
        expect(page).to have_content("Leclerc")
        assert_strategy_tag(strategy, fallback_label: label)
        expect(page).to have_content(expected_metric_label(strategy))

        assert_no_runtime_error

        result = cached_result_from_current_page
        expect(result[:success]).to eq(true)
        expect(result[:mode]).to eq("single_store")
        expect(result[:strategy]).to eq(strategy.to_s)
        expect(Array(result.dig(:comparison, :agent_audit, :errors))).to eq([])

        winner = result.dig(:comparison, :items, 0, :winner_product)
        expect(winner).to be_present
        expect(result.dig(:comparison, :items, 0, :winner_store)).to eq("leclerc")

        assert_price_coherence(strategy, winner)
        assert_status_endpoint_ready!

        stores = result.dig(:comparison, :optimal_cart, :stores) || {}
        store_keys = stores.keys.map(&:to_s)
        expect(store_keys).to eq([ "leclerc" ])
      end
    end
  end

  context "multi-enseignes" do
    STRATEGIES.each do |strategy, label|
      it "valide #{strategy} en mode multi_store" do
        launch_comparison(mode: "multi_store", store: nil, strategy: strategy)

        expect(page).to have_content("Résultats de comparaison")
        expect(page).to have_content("Multi-enseignes")
        expect(page).to have_content("Répartition par enseigne")
        assert_strategy_tag(strategy, fallback_label: label)
        expect(page).to have_content(expected_metric_label(strategy))

        assert_no_runtime_error

        result = cached_result_from_current_page
        expect(result[:success]).to eq(true)
        expect(result[:mode]).to eq("multi_store")
        expect(result[:strategy]).to eq(strategy.to_s)
        expect(Array(result.dig(:comparison, :agent_audit, :errors))).to eq([])

        winner = result.dig(:comparison, :items, 0, :winner_product)
        expect(winner).to be_present
        assert_price_coherence(strategy, winner)
        assert_status_endpoint_ready!

        stores = result.dig(:comparison, :optimal_cart, :stores) || {}
        store_keys = stores.keys.map(&:to_s)
        expect(store_keys).to include("leclerc", "carrefour")
      end
    end
  end

  private

  def expected_metric_label(strategy)
    {
      cheapest: "Prix",
      best_per_kg: "€/kg",
      per_unit: "€/u",
      best_per_l: "€/L"
    }.fetch(strategy)
  end

  def assert_strategy_tag(strategy, fallback_label:)
    visible_badges = {
      cheapest: "Moins cher",
      best_per_kg: "€/kg",
      per_unit: "€/u",
      best_per_l: "€/L"
    }

    expected = visible_badges.fetch(strategy)
    expect(page.text.include?(expected) || page.text.include?(fallback_label)).to eq(true)
  end

  def launch_comparison(mode:, strategy:, store:)
    visit root_path

    fill_in "comparison_city", with: "Paris"
    first("input[name='comparison[items_text][]']", visible: :all).set("pates")

    if mode == "single_store"
      choose "comparison_mode_single_store"
      select "Leclerc Drive", from: "comparison_store" if store == "leclerc"
    else
      choose "comparison_mode_multi_store"
    end

    choose "comparison_strategy_#{strategy}"
    click_button "Comparer les prix"

    drain_comparison_job!
    visit page.current_path
  end

  def drain_comparison_job!
    job = enqueued_jobs.find { |entry| entry[:job] == BuildComparisonJob }
    expect(job).to be_present
    BuildComparisonJob.perform_now(*job[:args])
    clear_enqueued_jobs
  end

  def cached_result_from_current_page
    id = page.current_path.split("/").last
    cached = Rails.cache.read("comparison_result:#{id}")
    expect(cached).to be_present
    cached.deep_symbolize_keys
  end

  def assert_status_endpoint_ready!
    id = page.current_path.split("/").last
    visit status_comparison_path(id)
    payload = JSON.parse(page.text)

    expect(payload["ready"]).to eq(true)
    expect(payload["processing"]).to eq(false)
    expect(payload["success"]).to eq(true)

    visit comparison_path(id)
  end

  def assert_no_runtime_error
    aggregate_failures do
      expect(page).to have_no_text("Turbo::")
      expect(page).to have_no_text("ActionController::")
      expect(page).to have_no_text("AbstractController::")
      expect(page).to have_no_text("NoMethodError")
      expect(page).to have_no_text("Erreur agent")
      expect(page).to have_no_text("stack trace")
    end
  end

  def assert_price_coherence(strategy, winner)
    price = winner[:price].to_f
    per_kg = winner[:price_per_kg].to_f
    per_unit = winner[:price_per_unit].to_f
    per_l = winner[:price_per_l].to_f

    expect(price).to be > 0

    case strategy
    when :cheapest
      expect(price).to eq(1.79)
    when :best_per_kg
      expect(per_kg).to eq(2.58)
    when :per_unit
      expect(per_unit).to eq(0.59)
    when :best_per_l
      expect(per_l).to eq(1.49)
    end
  end

  def build_stubbed_result(mode:, strategy:, items:, store:)
    safe_items = Array(items).map(&:to_s).map(&:strip).reject(&:blank?)
    query = safe_items.first || "pates"

    strategy_winner = {
      "cheapest" => {
        name: "Pates Eco",
        price: 1.79,
        quantity: "500g",
        price_per_kg: 3.58,
        price_per_unit: 0.89,
        price_per_l: 3.58
      },
      "best_per_kg" => {
        name: "Pates Family",
        price: 2.58,
        quantity: "1kg",
        price_per_kg: 2.58,
        price_per_unit: 1.29,
        price_per_l: 2.58
      },
      "per_unit" => {
        name: "Yaourt x8",
        price: 4.72,
        quantity: "8",
        price_per_kg: nil,
        price_per_unit: 0.59,
        price_per_l: nil
      },
      "best_per_l" => {
        name: "Lait demi-ecreme",
        price: 1.49,
        quantity: "1L",
        price_per_kg: nil,
        price_per_unit: 1.49,
        price_per_l: 1.49
      }
    }.fetch(strategy)

    base = {
      success: true,
      processing: false,
      mode: mode,
      strategy: strategy,
      items: [ query ],
      errors: []
    }

    if mode == "single_store"
      store_key = store.presence || "leclerc"
      base.merge(
        comparison: {
          items: [
            {
              query: query,
              winner_store: store_key,
              winner_product: strategy_winner.merge(url: "https://example.test/#{strategy}")
            }
          ],
          optimal_cart: {
            total: strategy_winner[:price],
            stores: {
              store_key => {
                subtotal: strategy_winner[:price],
                items: [
                  {
                    query: query,
                    product_name: strategy_winner[:name],
                    price: strategy_winner[:price]
                  }
                ]
              }
            }
          },
          agent_audit: {
            errors: [],
            steps: %w[normalizeItems searchProduct extractProductList normalizeUnits computeDerivedPrices sort pickBest]
          }
        }
      )
    else
      base.merge(
        comparison: {
          items: [
            {
              query: query,
              winner_store: "carrefour",
              winner_product: strategy_winner.merge(url: "https://example.test/#{strategy}")
            }
          ],
          optimal_cart: {
            total: (strategy_winner[:price] + 1.99).round(2),
            stores: {
              "carrefour" => {
                subtotal: strategy_winner[:price],
                items: [
                  {
                    query: query,
                    product_name: strategy_winner[:name],
                    price: strategy_winner[:price]
                  }
                ]
              },
              "leclerc" => {
                subtotal: 1.99,
                items: [
                  {
                    query: "huile",
                    product_name: "Huile Leclerc",
                    price: 1.99
                  }
                ]
              }
            }
          },
          agent_audit: {
            errors: [],
            steps: %w[normalizeItems searchProduct extractProductList normalizeUnits computeDerivedPrices sort pickBest]
          }
        }
      )
    end
  end
end
