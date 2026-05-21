require "rails_helper"

RSpec.describe "Billing", type: :request do
  describe "POST /billing/create_checkout_session" do
    let(:user) do
      User.create!(
        email: "billing@example.com",
        password: "password123",
        password_confirmation: "password123"
      )
    end

    it "requires authentication" do
      post "/billing/create_checkout_session", params: { plan: "premium" }

      expect(response).to redirect_to(new_user_session_path)
    end

    it "returns checkout url for authenticated user" do
      sign_in user
      allow_any_instance_of(StripeService).to receive(:create_checkout_session).and_return(Struct.new(:url).new("https://stripe.test/checkout"))

      post "/billing/create_checkout_session", params: { plan: "premium" }, as: :json

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["checkout_url"]).to eq("https://stripe.test/checkout")
    end
  end
end
