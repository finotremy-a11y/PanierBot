class Api::V1::BaseController < ActionController::API
  before_action :authenticate_api_key!

  rescue_from(StandardError, with: :render_internal_error)
  rescue_from ActionController::ParameterMissing, with: :render_bad_request
  rescue_from ArgumentError, with: :render_bad_request

  private

  def authenticate_api_key!
    expected_key = ENV.fetch("PANIERBOT_API_KEY", "test-api-key")
    provided_key = request.headers["X-API-Key"].to_s.presence || bearer_token

    return if ActiveSupport::SecurityUtils.secure_compare(provided_key.to_s, expected_key.to_s)

    render_api_error(
      status: :unauthorized,
      error: "unauthorized",
      message: "Invalid or missing API credentials.",
      code: "api_key_invalid"
    )
  end

  def bearer_token
    auth_header = request.headers["Authorization"].to_s
    return nil unless auth_header.start_with?("Bearer ")

    auth_header.delete_prefix("Bearer ").strip
  end

  def render_bad_request(error)
    render_api_error(
      status: :bad_request,
      error: "bad_request",
      message: error.message,
      code: "invalid_request"
    )
  end

  def render_internal_error(error)
    Rails.logger.error(api_log_payload(level: "error", event: "api.exception", error: error.message, error_class: error.class.name).to_json)
    render_api_error(
      status: :internal_server_error,
      error: "internal_server_error",
      message: "An unexpected error occurred.",
      code: "internal_error"
    )
  end

  def render_api_error(status:, error:, message:, code:, retry_after: nil)
    payload = {
      error: error,
      message: message,
      code: code
    }
    payload[:retry_after] = retry_after if retry_after

    render json: payload, status: status
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
