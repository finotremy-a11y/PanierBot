require "rails_helper"

RSpec.describe "Api::V1::Stores", type: :request do
  let(:headers) { { "X-API-Key" => "test-api-key" } }

  it "returns available stores grouped by enseigne" do
    get "/api/v1/stores", headers: headers

    expect(response).to have_http_status(:ok)
    body = JSON.parse(response.body)
    expect(body["stores"]).to be_an(Array)
    expect(body["stores"].map { |entry| entry["key"] }).to include("leclerc", "carrefour", "intermarche", "superu")
  end
end
