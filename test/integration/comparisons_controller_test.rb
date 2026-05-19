require "test_helper"

class ComparisonsControllerTest < ActionDispatch::IntegrationTest
  # Use a real in-memory cache store so Rails.cache.write/read work in tests
  setup    { @original_cache = Rails.cache; Rails.cache = ActiveSupport::Cache::MemoryStore.new }
  teardown { Rails.cache = @original_cache }

  # ── POST /compare ────────────────────────────────────────────────────────────

  test "POST /compare with valid multi_store params creates job and redirects" do
    assert_enqueued_with(job: BuildComparisonJob) do
      post compare_path, params: {
        comparison: {
          items_text: ["pâtes", "lait"],
          mode:       "multi_store",
          strategy:   "cheapest",
          city:       "Paris"
        }
      }
    end
    assert_response :redirect
    follow_redirect!
    assert_response :success
  end

  test "POST /compare with valid single_store params creates job and redirects" do
    assert_enqueued_with(job: BuildComparisonJob) do
      post compare_path, params: {
        comparison: {
          items_text: ["bananes"],
          mode:       "single_store",
          strategy:   "cheapest",
          store:      "leclerc",
          city:       "Paris"
        }
      }
    end
    assert_response :redirect
  end

  test "POST /compare with no items redirects with alert" do
    post compare_path, params: {
      comparison: { items_text: [], mode: "multi_store", strategy: "cheapest" }
    }
    assert_response :redirect
    assert_redirected_to home_path
  end

  # Invalid strategy is normalized to "cheapest" — still processes fine
  test "POST /compare with invalid strategy normalizes and creates job" do
    assert_enqueued_with(job: BuildComparisonJob) do
      post compare_path, params: {
        comparison: { items_text: ["pâtes"], mode: "multi_store", strategy: "hack; rm -rf /" }
      }
    end
    assert_response :redirect
  end

  # Invalid mode is normalized to "multi_store" — still processes fine
  test "POST /compare with invalid mode normalizes and creates job" do
    assert_enqueued_with(job: BuildComparisonJob) do
      post compare_path, params: {
        comparison: { items_text: ["pâtes"], mode: "invalid_mode", strategy: "cheapest" }
      }
    end
    assert_response :redirect
  end

  # ── GET /comparisons/:id ─────────────────────────────────────────────────────

  test "GET /comparisons/:id shows page when job in progress" do
    result_id = SecureRandom.uuid
    Rails.cache.write("comparison_result:#{result_id}", {
      processing: true, mode: "multi_store", strategy: "cheapest",
      items: ["pâtes"], city: "Paris"
    })

    get comparison_path(result_id)
    assert_response :success
  end

  test "GET /comparisons/:id with unknown id shows error state" do
    get comparison_path("nonexistent-id-xyz")
    assert_response :success
  end

  # ── GET /comparisons/:id/status ──────────────────────────────────────────────

  test "GET /comparisons/:id/status returns JSON when processing" do
    result_id = SecureRandom.uuid
    Rails.cache.write("comparison_result:#{result_id}", { processing: true })

    get status_comparison_path(result_id), as: :json
    assert_response :success
    data = response.parsed_body
    assert_equal true,  data["processing"]
    assert_equal false, data["ready"]
  end

  test "GET /comparisons/:id/status returns ready when done" do
    result_id = SecureRandom.uuid
    Rails.cache.write("comparison_result:#{result_id}", {
      success: true, processing: false,
      mode: "multi_store", strategy: "cheapest",
      items: [], comparison: {}, errors: []
    })

    get status_comparison_path(result_id), as: :json
    assert_response :success
    data = response.parsed_body
    assert_equal false, data["processing"]
    assert_equal true,  data["ready"]
    assert_equal true,  data["success"]
  end

  test "GET /comparisons/:id/status returns not_found for unknown id" do
    get status_comparison_path("does-not-exist"), as: :json
    assert_response :success
    data = response.parsed_body
    assert_equal false, data["processing"]
    assert_equal false, data["ready"]
  end
end
