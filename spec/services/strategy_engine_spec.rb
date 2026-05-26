require "rails_helper"

RSpec.describe StrategyEngine do
  let(:products) do
    [
      {
        id: "p1",
        name: "Pates A",
        price: 2.40,
        price_per_kg: 2.40,
        price_per_unit: 1.20,
        price_per_l: nil,
        store: "leclerc"
      },
      {
        id: "p2",
        name: "Pates B",
        price: 2.10,
        price_per_kg: 2.62,
        price_per_unit: 0.70,
        price_per_l: nil,
        store: "carrefour"
      },
      {
        id: "p3",
        name: "Jus C",
        price: 1.80,
        price_per_kg: nil,
        price_per_unit: 0.90,
        price_per_l: 1.80,
        store: "superu"
      },
      {
        id: "p4",
        name: "Jus D",
        price: 2.00,
        price_per_kg: nil,
        price_per_unit: 1.00,
        price_per_l: 1.25,
        store: "intermarche"
      }
    ]
  end

  subject(:engine) { described_class.new(products) }

  describe "#compute_cheapest" do
    it "returns product with the lowest total price" do
      winner = engine.compute_cheapest

      expect(winner).to be_present
      expect(winner[:id]).to eq("p3")
    end
  end

  describe "#compute_best_per_kg" do
    it "returns product with the lowest price per kilogram" do
      winner = engine.compute_best_per_kg

      expect(winner).to be_present
      expect(winner[:id]).to eq("p1")
    end
  end

  describe "#compute_per_unit" do
    it "returns product with the lowest unit price" do
      winner = engine.compute_per_unit

      expect(winner).to be_present
      expect(winner[:id]).to eq("p2")
    end
  end

  describe "#compute_best_per_l" do
    it "returns product with the lowest price per liter" do
      winner = engine.compute_best_per_l

      expect(winner).to be_present
      expect(winner[:id]).to eq("p4")
    end
  end
end
