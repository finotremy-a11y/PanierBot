class Api::V1::BaseController < ActionController::API
  before_action :authenticate_api_key!
  around_action :log_api_request

  rescue_from(StandardError, with: :render_internal_error)
  rescue_from ActionController::ParameterMissing, with: :render_bad_request
  rescue_from ArgumentError, with: :render_bad_request

  private

  def authenticate_api_key!
    expected_key = ENV.fetch("PANIERBOT_API_KEY", "test-api-key")
    provided_key = request.headers["X-API-Key"].to_s.presence || bearer_token

    return if ActiveSupport::SecurityUtils.secure_compare(provided_key.to_s, expected_key.to_s)

    render json: { error: "Unauthorized" }, status: :unauthorized
  end

  def bearer_token
    auth_header = request.headers["Authorization"].to_s
    return nil unless auth_header.start_with?("Bearer ")

    auth_header.delete_prefix("Bearer ").strip
  end

  def render_bad_request(error)
    render json: { error: error.message }, status: :bad_request
  end

  def render_internal_error(error)
    Rails.logger.error(api_log_payload(level: "error", event: "api.exception", error: error.message, error_class: error.class.name).to_json)
    render json: { error: "Internal server error" }, status: :internal_server_error
  end

  def log_api_request
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    yield
  ensure
    duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000.0).round(2)
    Rails.logger.info(api_log_payload(level: "info", event: "api.request", duration_ms: duration_ms).to_json)
  end

  def api_log_payload(extra = {})
    {
      timestamp: Time.current.utc.iso8601(3),
      method: request.method,
      path: request.fullpath,
      request_id: request.request_id,
      status: response.status,
      remote_ip: request.remote_ip
    }.merge(extra)
  end
end
