frontend_origin = if Rails.env.production?
  ENV.fetch("FRONTEND_APP_ORIGIN")
else
  ENV.fetch("FRONTEND_APP_ORIGIN", "http://localhost:3000")
end

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(frontend_origin)

    resource "/api/v1/*",
      headers: [ "X-API-Key", "Authorization", "Content-Type", "X-User-Id" ],
      methods: %i[get post options],
      credentials: false,
      max_age: 600
  end
end
