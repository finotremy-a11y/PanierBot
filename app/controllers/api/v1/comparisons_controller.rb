class Api::V1::ComparisonsController < Api::V1::BaseController
  STRATEGIES = %w[cheapest best_per_kg per_unit best_per_l].freeze
  MODES = %w[single_store multi_store].freeze

  def create
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    payload = compare_params

    identifier = request.remote_ip.presence || request.user_agent.to_s.first(32)
    unless ComparisonResilience.allow_request?(scope: "api_compare", identifier: identifier, limit: 12, period: 1.minute)
      return render json: {
        success: false,
        error: "rate_limited",
        message: "Too many comparison requests. Retry later.",
        code: "rate_limit_exceeded"
      }, status: :too_many_requests
    end

    signature = ComparisonResilience.build_signature(
      items: payload[:items],
      strategy: payload[:strategy],
      mode: payload[:mode],
      city: params[:city]
    )

    cached_result = ComparisonResilience.fetch_cached_result(signature, namespace: "api")
    if cached_result.present?
      execution_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000.0).round(2)
      return render json: cached_result.merge(cached: true, execution_time_ms: execution_ms), status: :ok
    end

    result = FinalCartBuilder.new(
      items: payload[:items],
      strategy: payload[:strategy],
      mode: payload[:mode]
    ).call

    execution_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000.0).round(2)

    response_payload = {
      success: result[:success],
      mode: payload[:mode],
      strategy: payload[:strategy],
      products: result[:products],
      prices: {
        total: result[:total],
        by_store: result[:totals_by_store]
      },
      stores: result[:stores],
      logs: result[:logs],
      execution_time_ms: execution_ms,
      errors: result[:errors]
    }

    ComparisonResilience.write_cached_result(signature, response_payload, namespace: "api")

    render json: response_payload, status: result[:success] ? :ok : :unprocessable_entity
  end

  private

  def compare_params
    permitted = params.permit(:strategy, :mode, items: [])

    items = Array(permitted[:items]).map(&:to_s).map(&:strip).reject(&:blank?)
    raise ArgumentError, "items must contain at least one product" if items.empty?

    strategy = permitted[:strategy].to_s.downcase
    mode = permitted[:mode].to_s.downcase

    raise ArgumentError, "strategy is invalid" unless STRATEGIES.include?(strategy)
    raise ArgumentError, "mode is invalid" unless MODES.include?(mode)

    { items: items, strategy: strategy, mode: mode }
  end
end
