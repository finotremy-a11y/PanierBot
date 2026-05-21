require "rails_helper"

RSpec.describe "Full comparison flow", type: :system do
  include ActiveJob::TestHelper

  STRATEGIES = %w[cheapest best_per_kg per_unit best_per_l].freeze

  before do
    driven_by(:rack_test)
    clear_enqueued_jobs
    clear_performed_jobs
    @original_adapter = ActiveJob::Base.queue_adapter
    @memory_cache = ActiveSupport::Cache::MemoryStore.new
    ActiveJob::Base.queue_adapter = :test
    allow(Rails).to receive(:cache).and_return(@memory_cache)
  end

  after do
    ActiveJob::Base.queue_adapter = @original_adapter
  end

  let(:user) do
    User.create!(
      email: "full-flow-#{SecureRandom.hex(4)}@example.com",
      password: "password123",
      password_confirmation: "password123",
      plan: "premium",
      subscription_status: "active"
    )
  end

  before do
    allow_any_instance_of(ComparisonBuilder).to receive(:call) do |builder|
      build_stubbed_result(
        items: builder.instance_variable_get(:@items),
        strategy: builder.instance_variable_get(:@strategy),
        mode: builder.instance_variable_get(:@mode),
        store: builder.instance_variable_get(:@store)
      )
    end
  end

  context "mono-enseigne" do
    STRATEGIES.each do |strategy|
      it "runs the complete flow with strategy #{strategy}" do
        sign_in user
        submit_comparison(items: ["  pâtes  "], mode: "single_store", store: "leclerc", strategy: strategy)

        expect(page).to have_content("Résultats de comparaison")
        expect(page).to have_content("Mono-enseigne")
        expect(page).to have_content("Articles recherchés")
        expect(page).to have_content("Pâtes")
        expect(page).to have_content("Détail par produit")
        expect(page).to have_content("Leclerc")

        assert_strategy_badge(strategy)
        assert_no_ui_error

        result = cached_result_from_page
        expect(result[:success]).to eq(true)
        expect(result[:mode]).to eq("single_store")
        expect(result[:strategy]).to eq(strategy)
        expect(result[:items]).to eq(["pâtes"])
        expect(result.dig(:comparison, :agent_audit, :errors)).to eq([])
        expect(result.dig(:comparison, :agent_audit, :received_items)).to eq(["pâtes"])
        expect(result.dig(:comparison, :agent_audit, :steps)).to eq(
          %w[normalizeItems searchProduct extractProductList normalizeUnits computeDerivedPrices sort pickBest]
        )
        expect(result.dig(:comparison, :agent_audit, :errors)).not_to include("normalizeItems is not defined")
      end
    end
  end

  context "multi-enseignes" do
    STRATEGIES.each do |strategy|
      it "runs the complete flow with strategy #{strategy}" do
        sign_in user
        submit_comparison(items: ["pâtes"], mode: "multi_store", store: nil, strategy: strategy)

        expect(page).to have_content("Résultats de comparaison")
        expect(page).to have_content("Multi-enseignes")
        expect(page).to have_content("Panier optimal")
        expect(page).to have_content("Répartition par enseigne")
        expect(page).to have_content("Leclerc")
        expect(page).to have_content("Carrefour")

        assert_strategy_badge(strategy)
        assert_no_ui_error

        result = cached_result_from_page
        expect(result[:success]).to eq(true)
        expect(result[:mode]).to eq("multi_store")
        expect(result[:strategy]).to eq(strategy)
        expect(result[:items]).to eq(["pâtes"])

        optimal = result.dig(:comparison, :optimal_cart)
        expect(optimal[:total].to_f).to be > 0
        expect(optimal.dig(:stores, :leclerc, :items)).not_to be_empty
        expect(optimal.dig(:stores, :carrefour, :items)).not_to be_empty

        expect(result.dig(:comparison, :agent_audit, :errors)).to eq([])
        expect(result.dig(:comparison, :agent_audit, :steps)).to eq(
          %w[normalizeItems searchProduct extractProductList normalizeUnits computeDerivedPrices sort pickBest]
        )
      end
    end
  end

  it "exposes Turbo + Stimulus hooks and accepts Turbo Stream submit without 406" do
    sign_in user

    visit root_path
    expect(page).to have_css("form[data-turbo='true'][data-controller='compare']")
    expect(page).to have_css("[data-controller='list']")
    expect(page).to have_css("[data-controller~='mode']")
    expect(page).to have_css("[data-strategy-target='root']")
    expect(page).to have_css("[data-action='change->mode#changed']", minimum: 1)
    expect(page).to have_css("[data-action='change->strategy#changed']", minimum: 1)
    expect(page).to have_css("[data-action='input->list#inputChanged']", minimum: 1)

    choose "comparison_mode_single_store"
    select "Leclerc Drive", from: "comparison_store"
    choose "comparison_strategy_cheapest"
    fill_in "comparison_city", with: "Paris"
    fill_in "comparison[items_text][]", with: "pâtes"
    click_button "Comparer les prix"
    drain_comparison_job!
    visit page.current_path

    expect(page.status_code).to eq(200)
    expect(page).to have_content("Résultats de comparaison")
    expect(page).to have_content("Détail par produit")
  end

  private

  def submit_comparison(items:, mode:, strategy:, store:)
    visit root_path
    fill_in "comparison_city", with: "Paris"

    first("input[name='comparison[items_text][]']", visible: :all).set(items.first)

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

  def cached_result_from_page
    id = page.current_path.split("/").last
    result = Rails.cache.read("comparison_result:#{id}")
    expect(result).to be_present
    result.deep_symbolize_keys
  end

  def assert_strategy_badge(strategy)
    expected = {
      "cheapest" => "Moins cher",
      "best_per_kg" => "€/kg",
      "per_unit" => "€/u",
      "best_per_l" => "€/L"
    }
    expect(page).to have_content(expected.fetch(strategy))
  end

  def assert_no_ui_error
    aggregate_failures do
      expect(page).to have_no_text("Erreur")
      expect(page).to have_no_text("ActionController::")
      expect(page).to have_no_text("AbstractController::")
      expect(page).to have_no_text("NoMethodError")
      expect(page).to have_no_text("normalizeItems is not defined")
      expect(page).to have_no_text("stack trace")
    end
  end

  def build_stubbed_result(items:, strategy:, mode:, store:)
    clean_items = Array(items).map(&:to_s).map(&:strip).reject(&:blank?)

    winner = {
      name: "Pates premium",
      price: 1.49,
      quantity: "500g",
      price_per_kg: (strategy == "best_per_kg" ? 2.98 : 3.20),
      price_per_l: (strategy == "best_per_l" ? 1.20 : nil),
      price_per_unit: (strategy == "per_unit" ? 0.74 : nil),
      url: "https://example.test/pates"
    }

    base = {
      success: true,
      processing: false,
      mode: mode,
      strategy: strategy,
      items: clean_items,
      errors: []
    }

    if mode == "single_store"
      base.merge(
        comparison: {
          items: [
            {
              query: clean_items.first,
              winner_store: store.presence || "leclerc",
              winner_product: winner
            }
          ],
          optimal_cart: {
            total: 1.49,
            stores: {
              (store.presence || "leclerc") => {
                subtotal: 1.49,
                items: [
                  {
                    query: clean_items.first,
                    product_name: winner[:name],
                    price: winner[:price]
                  }
                ]
              }
            }
          },
          agent_audit: {
            received_items: clean_items,
            steps: %w[normalizeItems searchProduct extractProductList normalizeUnits computeDerivedPrices sort pickBest],
            errors: []
          }
        }
      )
    else
      base.merge(
        comparison: {
          items: [
            {
              query: clean_items.first,
              winner_store: "carrefour",
              winner_product: winner.merge(price: 1.39)
            }
          ],
          optimal_cart: {
            total: 2.68,
            stores: {
              "carrefour" => {
                subtotal: 1.39,
                items: [
                  {
                    query: clean_items.first,
                    product_name: "Pates Carrefour",
                    price: 1.39
                  }
                ]
              },
              "leclerc" => {
                subtotal: 1.29,
                items: [
                  {
                    query: "lait",
                    product_name: "Lait Leclerc",
                    price: 1.29
                  }
                ]
              }
            }
          },
          agent_audit: {
            received_items: clean_items,
            steps: %w[normalizeItems searchProduct extractProductList normalizeUnits computeDerivedPrices sort pickBest],
            errors: []
          }
        }
      )
    end
  end
end