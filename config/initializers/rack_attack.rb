class Rack::Attack
  RATE_LIMIT_LOG_MESSAGE = "⛔ Rate limit triggered".freeze
  API_COMPARE_PATH = "/api/v1/compare".freeze
  WEB_COMPARE_PATH = "/compare".freeze

  cache.store = if Rails.cache.is_a?(ActiveSupport::Cache::NullStore)
    ActiveSupport::Cache::MemoryStore.new
  else
    Rails.cache
  end

  safelist("allow-localhost") do |req|
    !Rails.env.test? && (req.ip == "127.0.0.1" || req.ip == "::1")
  end

  throttle("api/ip", limit: 30, period: 1.minute) do |req|
    req.ip if req.path.start_with?("/api/v1/")
  end

  throttle("api/free-user-comparisons", limit: 10, period: 1.minute) do |req|
    next unless req.post? && req.path == API_COMPARE_PATH

    user = rack_attack_user(req)
    user.id if user&.free?
  end

  throttle("web/compare/ip", limit: 8, period: 1.minute) do |req|
    req.ip if req.post? && req.path == WEB_COMPARE_PATH
  end

  throttle("auth/ip", limit: 20, period: 1.minute) do |req|
    req.ip if req.post? && req.path.start_with?("/users/")
  end

  throttle("billing/ip", limit: 60, period: 1.minute) do |req|
    req.ip if req.path.start_with?("/billing")
  end

  self.throttled_responder = lambda do |request|
    match_data = request.env["rack.attack.match_data"] || {}
    retry_after = Rack::Attack.retry_after_seconds(match_data)

    Rails.logger.warn(
      {
        message: RATE_LIMIT_LOG_MESSAGE,
        event: "rack.attack.throttled",
        discriminator: request.env["rack.attack.matched"],
        path: request.path,
        ip: request.ip,
        method: request.request_method,
        retry_after: retry_after
      }.to_json
    )

    body = {
      error: "rate_limited",
      message: "Too many requests. Retry later.",
      code: "rate_limit_exceeded",
      retry_after: retry_after
    }.to_json

    [
      429,
      {
        "Content-Type" => "application/json",
        "Retry-After" => retry_after.to_s
      },
      [ body ]
    ]
  end

  def self.rack_attack_user(req)
    user_id = req.get_header("HTTP_X_USER_ID").presence || session_user_id(req)
    return if user_id.blank?

    User.find_by(id: user_id)
  rescue StandardError
    nil
  end

  def self.session_user_id(req)
    session_key = req.session["warden.user.user.key"]
    Array(session_key).first&.first
  rescue StandardError
    nil
  end

  def self.retry_after_seconds(match_data)
    period = match_data[:period].to_i
    return 60 if period <= 0

    [ period - (Time.current.to_i % period), 1 ].max
  end
end

# Keep Rack::Attack disabled in development only. Test must exercise the
# middleware so request specs can validate throttling behavior.
Rack::Attack.enabled = !Rails.env.development?

Rails.application.config.middleware.use Rack::Attack

ActiveSupport::Notifications.subscribe("rack.attack") do |_name, _start, _finish, _request_id, payload|
  req = payload[:request]
  match_data = req.env["rack.attack.match_data"] || {}

  Rails.logger.warn(
    {
      message: Rack::Attack::RATE_LIMIT_LOG_MESSAGE,
      event: "rack.attack",
      discriminator: payload[:discriminator],
      path: req.path,
      ip: req.ip,
      method: req.request_method,
      retry_after: Rack::Attack.retry_after_seconds(match_data)
    }.to_json
  )
end
