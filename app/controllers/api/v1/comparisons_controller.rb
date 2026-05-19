class Api::V1::ComparisonsController < Api::V1::BaseController
  STRATEGIES = %w[cheapest best_per_kg per_unit best_per_l].freeze
  MODES = %w[single_store multi_store].freeze

  def create
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    payload = compare_params

    result = FinalCartBuilder.new(
      items: payload[:items],
      strategy: payload[:strategy],
      mode: payload[:mode]
    ).call

    execution_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000.0).round(2)

    render json: {
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
    }, status: result[:success] ? :ok : :unprocessable_entity
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
