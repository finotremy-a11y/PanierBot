class HomeController < ApplicationController
  def index
    @strategies = [
      { value: "cheapest", label: "Moins cher", icon: "💰", description: "Prix total le plus bas" },
      { value: "best_per_kg", label: "Meilleur €/kg", icon: "⚖️", description: "Optimal au kilogramme" },
      { value: "per_unit", label: "Meilleur €/pièce", icon: "🔢", description: "Optimal à l'unité" },
      { value: "best_per_l", label: "Meilleur €/L", icon: "🥛", description: "Optimal au litre" }
    ]
    @stores = [ "leclerc", "carrefour", "intermarche", "superu" ]
  end
end
