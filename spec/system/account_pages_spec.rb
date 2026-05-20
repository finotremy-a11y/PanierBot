require "rails_helper"

RSpec.describe "Account pages", type: :system do
  before do
    driven_by(:rack_test)
  end

  let(:user) do
    User.create!(
      email: "system@example.com",
      password: "password123",
      password_confirmation: "password123",
      plan: "premium",
      subscription_status: "active"
    )
  end

  it "shows all SaaS account pages" do
    sign_in user

    visit "/account"
    expect(page).to have_content("Compte")
    expect(page).to have_content("Premium")

    visit "/billing"
    expect(page).to have_content("Abonnement & facturation")
    expect(page).to have_content("Premium")

    visit "/plans"
    expect(page).to have_content("Plans PanierBot")
    expect(page).to have_content("Free")
    expect(page).to have_content("Premium")

    visit "/usage"
    expect(page).to have_content("Usage mensuel")
  end
end
