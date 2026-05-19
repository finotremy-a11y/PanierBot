Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      post :compare, to: "comparisons#create"
      get :stores, to: "stores#index"
      get :health, to: "health#show"
    end
  end

  # Health check
  get "up" => "rails/health#show", as: :rails_health_check

  # Landing page
  root "home#index"
  get "home", to: "home#index", as: :home

  # Comparison workflow (multi-store or single-store):
  # POST /compare        -> launch comparison job
  # GET  /comparisons/:id       -> show result
  # GET  /comparisons/:id/status -> JSON polling endpoint
  post "compare", to: "comparisons#create", as: :compare
  resources :comparisons, only: [ :show ] do
    member do
      get :status
    end
  end

  # Legacy cart workflow (single-store, kept for backward compatibility):
  resources :carts, only: [ :new, :create, :show ] do
    member do
      get :status
    end
  end
end
