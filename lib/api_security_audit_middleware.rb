class ApiSecurityAuditMiddleware
  SUSPICIOUS_PATTERN = %r{(\.\./|%2e%2e|<script|union\s+select|sleep\(|/etc/passwd|%00)}i.freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    request = ActionDispatch::Request.new(env)
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    log_suspicious_request(request) if suspicious_request?(request)

    status, headers, response = @app.call(env)
    duration_ms = elapsed_ms(started_at)

    Rails.logger.info(log_payload(request, event: "api.latency", status: status, duration_ms: duration_ms).to_json)

    [status, headers, response]
  rescue StandardError => error
    Rails.logger.error(
      log_payload(
        request,
        event: "api.error",
        error_class: error.class.name,
        error_message: error.message,
        duration_ms: elapsed_ms(started_at)
      ).to_json
    )
    raise
  end

  private

  def elapsed_ms(started_at)
    ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000.0).round(2)
  end

  def suspicious_request?(request)
    request_signature = [request.fullpath, request.user_agent, request.get_header("HTTP_ORIGIN")].compact.join(" ")

    suspicious_origin?(request) ||
      request.user_agent.blank? ||
      request_signature.match?(SUSPICIOUS_PATTERN)
  end

  def suspicious_origin?(request)
    return false unless request.path.start_with?("/api/v1/")

    origin = request.get_header("HTTP_ORIGIN").to_s
    return false if origin.blank?

    origin != allowed_frontend_origin
  end

  def allowed_frontend_origin
    if Rails.env.production?
      ENV.fetch("FRONTEND_APP_ORIGIN")
    else
      ENV.fetch("FRONTEND_APP_ORIGIN", "http://localhost:3000")
    end
  end

  def log_suspicious_request(request)
    Rails.logger.warn(log_payload(request, event: "api.suspicious_request").to_json)
  end

  def log_payload(request, extra = {})
    {
      timestamp: Time.current.utc.iso8601(3),
      method: request.request_method,
      path: request.fullpath,
      request_id: request.request_id,
      remote_ip: request.remote_ip,
      user_agent: request.user_agent,
      origin: request.get_header("HTTP_ORIGIN")
    }.merge(extra)
  end
end