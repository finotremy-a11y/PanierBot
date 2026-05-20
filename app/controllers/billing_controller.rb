class BillingController < ApplicationController
  before_action :authenticate_user!, except: :webhook
  skip_before_action :verify_authenticity_token, only: :webhook

  def show
    @plans = StripeService::PLAN_DEFINITIONS
  end

  def create_checkout_session
    Rails.logger.info(
      {
        event: "billing.checkout.requested",
        user_id: current_user.id,
        plan: params[:plan]
      }.to_json
    )

    session = StripeService.new(user: current_user).create_checkout_session(
      plan: params.require(:plan),
      success_url: billing_url,
      cancel_url: plans_url
    )

    render json: { checkout_url: session.url }, status: :ok
  rescue ActionController::ParameterMissing => e
    render json: { error: e.message }, status: :bad_request
  rescue StripeService::InvalidPlanError => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  def webhook
    payload = request.raw_post
    sig_header = request.headers["Stripe-Signature"]
    secret = ENV.fetch("STRIPE_WEBHOOK_SECRET")

    event = Stripe::Webhook.construct_event(payload, sig_header, secret)
    StripeService.handle_webhook(event)
    Rails.logger.info({ event: "billing.webhook.processed", stripe_event_type: event.type }.to_json)

    head :ok
  rescue KeyError
    Rails.logger.error({ event: "billing.webhook.misconfigured", error: "missing_webhook_secret" }.to_json)
    render json: { error: "Missing STRIPE_WEBHOOK_SECRET" }, status: :internal_server_error
  rescue Stripe::SignatureVerificationError
    Rails.logger.warn({ event: "billing.webhook.invalid_signature" }.to_json)
    render json: { error: "Invalid Stripe signature" }, status: :unauthorized
  rescue JSON::ParserError
    Rails.logger.warn({ event: "billing.webhook.invalid_payload" }.to_json)
    render json: { error: "Invalid payload" }, status: :bad_request
  end
end