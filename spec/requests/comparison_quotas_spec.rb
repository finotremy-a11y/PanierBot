require "rails_helper"

RSpec.describe "Comparison quotas", type: :request do
  let(:user) do
    User.create!(
      email: "free@example.com",
      password: "password123",
      password_confirmation: "password123",
      plan: "free",
      subscription_status: "active"
    )
  end

  before do
    sign_in user
  end

  it "blocks free users on multi-store mode" do
    post "/compare", params: {
      comparison: {
        items_text: ["pates"],
        strategy: "cheapest",
        mode: "multi_store",
        city: "Paris"
      }
    }

    expect(response).to redirect_to(home_path)
    expect(flash[:alert]).to include("mono-magasin")
  end

  it "blocks free users over monthly comparison limit" do
    ComparisonUsage.create!(
      user: user,
      period_start: Time.zone.today.beginning_of_month,
      comparisons_count: User::MONTHLY_COMPARISON_LIMIT,
      products_count: 100
    )

    post "/compare", params: {
      comparison: {
        items_text: ["pates"],
        strategy: "cheapest",
        mode: "single_store",
        store: "leclerc",
        city: "Paris"
      }
    }

    expect(response).to redirect_to(home_path)
    expect(flash[:alert]).to include("limite mensuelle")
  end

  it "blocks free users over product limit" do
    post "/compare", params: {
      comparison: {
        items_text: Array.new(User::PRODUCTS_PER_COMPARISON_LIMIT + 1, "pates"),
        strategy: "cheapest",
        mode: "single_store",
        store: "leclerc",
        city: "Paris"
      }
    }

    expect(response).to redirect_to(home_path)
    expect(flash[:alert]).to include("#{User::PRODUCTS_PER_COMPARISON_LIMIT} produits")
  end
end