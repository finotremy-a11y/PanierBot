class Rack::Attack
  safelist("allow localhost") do |req|
    req.ip == "127.0.0.1" || req.ip == "::1"
  end

  throttle("api/ip", limit: 120, period: 1.minute) do |req|
    req.ip if req.path.start_with?("/api/v1/")
  end

  throttle("api/key", limit: 300, period: 1.minute) do |req|
    next unless req.path.start_with?("/api/v1/")

    req.get_header("HTTP_X_API_KEY").presence || req.get_header("HTTP_AUTHORIZATION").presence || req.ip
  end

  self.throttled_responder = lambda do |_request|
    body = {
      error: "Rate limit exceeded"
    }.to_json

    [
      429,
      {
        "Content-Type" => "application/json"
      },
      [body]
    ]
  end
end

Rails.application.config.middleware.use Rack::Attack

ActiveSupport::Notifications.subscribe("rack.attack") do |_name, _start, _finish, _request_id, payload|
  req = payload[:request]
  Rails.logger.warn(
    {
      event: "rack.attack",
      discriminator: payload[:discriminator],
      path: req.path,
      ip: req.ip,
      method: req.request_method
    }.to_json
  )
end
