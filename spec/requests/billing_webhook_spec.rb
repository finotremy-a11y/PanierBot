require "rails_helper"

RSpec.describe "Billing webhook", type: :request do
  let!(:user) do
    User.create!(
      email: "webhook@example.com",
      password: "password123",
      password_confirmation: "password123",
      stripe_customer_id: "cus_123"
    )
  end

  let(:subscription) do
    Stripe::StripeObject.construct_from(
      {
        id: "sub_123",
        customer: "cus_123",
        status: "active",
        metadata: { plan: "premium" },
        items: {
          data: [{ price: { id: "price_any" } }]
        }
      }
    )
  end

  let(:event) do
    Stripe::Event.construct_from(
      {
        id: "evt_123",
        type: "customer.subscription.updated",
        data: { object: subscription }
      }
    )
  end

  before do
    allow(ENV).to receive(:fetch).and_call_original
    allow(ENV).to receive(:fetch).with("STRIPE_WEBHOOK_SECRET").and_return("whsec_test")
  end

  it "updates user subscription when signature is valid" do
    allow(Stripe::Webhook).to receive(:construct_event).and_return(event)

    post "/billing/webhook", params: "{}", headers: { "Stripe-Signature" => "sig" }

    expect(response).to have_http_status(:ok)
    expect(user.reload.plan).to eq("premium")
    expect(user.subscription_status).to eq("active")
    expect(user.stripe_subscription_id).to eq("sub_123")
  end

  it "rejects invalid Stripe signatures" do
    allow(Stripe::Webhook).to receive(:construct_event).and_raise(Stripe::SignatureVerificationError.new("invalid", "sig"))

    post "/billing/webhook", params: "{}", headers: { "Stripe-Signature" => "sig" }

    expect(response).to have_http_status(:unauthorized)
  end
end