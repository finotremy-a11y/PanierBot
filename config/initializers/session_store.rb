Rails.application.config.session_store :cookie_store,
  key: "_panierbot_session",
  expire_after: 30.minutes,
  httponly: true,
  same_site: :strict,
  secure: Rails.env.production?,
  cookies_only: true
