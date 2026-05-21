Rails.application.routes.draw do
  devise_for :users, controllers: { sessions: "users/sessions" }

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
  get "manifest.json", to: "home#manifest"
  get "service-worker.js", to: "home#service_worker"

  # SaaS account pages
  get "account", to: "accounts#show"
  get "billing", to: "billing#show"
  get "plans", to: "plans#index"
  get "usage", to: "usage#show"

  # Stripe billing endpoints
  post "billing/create_checkout_session", to: "billing#create_checkout_session"
  post "billing/webhook", to: "billing#webhook"

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
