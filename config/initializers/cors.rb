allowed_origins = ENV.fetch("API_CORS_ORIGINS", "http://localhost:3000").split(",").map(&:strip).reject(&:empty?)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*allowed_origins)

    resource "/api/v1/*",
      headers: ["X-API-Key", "Authorization", "Content-Type"],
      methods: %i[get post options],
      max_age: 600
  end
end
