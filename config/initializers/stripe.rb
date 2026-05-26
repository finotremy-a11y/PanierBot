required_stripe_env = %w[STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PREMIUM_PRICE_ID]

if Rails.env.production?
  missing = required_stripe_env.select { |key| ENV[key].to_s.strip.empty? }
  if missing.any?
    raise "Missing required Stripe env vars in production: #{missing.join(', ')}"
  end
end

if ENV["STRIPE_SECRET_KEY"].present?
  Stripe.api_key = ENV["STRIPE_SECRET_KEY"]
end
