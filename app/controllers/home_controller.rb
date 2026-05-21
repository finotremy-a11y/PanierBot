class HomeController < ApplicationController
  skip_forgery_protection only: :service_worker

  def index
    @strategies = [
      { value: "cheapest", label: "Moins cher", icon: "💰", description: "Prix total le plus bas" },
      { value: "best_per_kg", label: "Meilleur €/kg", icon: "⚖️", description: "Optimal au kilogramme" },
      { value: "per_unit", label: "Meilleur €/pièce", icon: "🔢", description: "Optimal à l'unité" },
      { value: "best_per_l", label: "Meilleur €/L", icon: "🥛", description: "Optimal au litre" }
    ]
    @stores = [ "leclerc", "carrefour", "intermarche", "superu" ]
  end

  def manifest
    response.headers["Content-Type"] = "application/manifest+json"
    render :manifest, formats: :json, layout: false
  end

  def service_worker
    response.headers["Content-Type"] = "application/javascript"
    response.headers["Service-Worker-Allowed"] = "/"
    render :service_worker, formats: :js, layout: false
  end
end
