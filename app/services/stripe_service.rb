class StripeService
  class InvalidPlanError < StandardError; end

  PLAN_DEFINITIONS = {
    "free" => {
      label: "Free",
      limits: "2 comparaisons/mois, 20 produits/comparaison",
      features: "Mono-magasin limite"
    },
    "premium" => {
      label: "Premium",
      limits: "Illimité",
      features: "Mono-magasin illimite, multi-magasins et priorite"
    }
  }.freeze

  SUBSCRIPTION_EVENTS = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted"
  ].freeze

  def initialize(user:)
    @user = user
    Stripe.api_key = ENV["STRIPE_SECRET_KEY"] if ENV["STRIPE_SECRET_KEY"].present?
  end

  def create_checkout_session(plan:, success_url:, cancel_url:)
    plan = plan.to_s
    raise InvalidPlanError, "Plan inconnu" unless PLAN_DEFINITIONS.key?(plan)

    if plan == "free"
      Rails.logger.info({ event: "billing.plan_downgraded", user_id: @user.id, plan: plan }.to_json)
      @user.update!(plan: "free", subscription_status: "active", stripe_subscription_id: nil)
      return Struct.new(:url).new(Rails.application.routes.url_helpers.billing_url)
    end

    Rails.logger.info({ event: "billing.checkout_session.created", user_id: @user.id, plan: plan }.to_json)

    session = Stripe::Checkout::Session.create(
      mode: "subscription",
      customer: stripe_customer_id,
      payment_method_types: ["card"],
      line_items: [{ price: price_id_for(plan), quantity: 1 }],
      metadata: { plan: plan, user_id: @user.id },
      success_url: with_status(success_url, "success"),
      cancel_url: with_status(cancel_url, "canceled")
    )

    session
  end

  def self.handle_webhook(event)
    return unless SUBSCRIPTION_EVENTS.include?(event.type)

    subscription = event.data.object
    Rails.logger.info(
      {
        event: "billing.webhook.received",
        stripe_event_type: event.type,
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id
      }.to_json
    )

    user = User.find_by(stripe_customer_id: subscription.customer)
    return unless user

    if event.type == "customer.subscription.deleted"
      Rails.logger.info({ event: "billing.subscription.deleted", user_id: user.id }.to_json)
      user.update!(plan: "free", subscription_status: "canceled", stripe_subscription_id: nil)
      return
    end

    user.update!(
      plan: plan_from_subscription(subscription),
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id
    )
  end

  def self.plan_from_subscription(subscription)
    price_id = subscription.items&.data&.first&.price&.id
    return "premium" if price_id.present? && price_id == ENV["STRIPE_PREMIUM_PRICE_ID"]

    metadata_plan = subscription.metadata["plan"].to_s.presence
    return metadata_plan if PLAN_DEFINITIONS.key?(metadata_plan)

    "premium"
  end

  private

  def stripe_customer_id
    return @user.stripe_customer_id if @user.stripe_customer_id.present?

    customer = Stripe::Customer.create(email: @user.email, metadata: { user_id: @user.id })
    @user.update!(stripe_customer_id: customer.id)
    customer.id
  end

  def price_id_for(plan)
    price_id = ENV["STRIPE_PREMIUM_PRICE_ID"] if plan == "premium"
    raise InvalidPlanError, "Prix Stripe manquant pour le plan #{plan}" if price_id.blank?

    price_id
  end

  def with_status(url, status)
    separator = url.include?("?") ? "&" : "?"
    "#{url}#{separator}checkout=#{status}"
  end
end