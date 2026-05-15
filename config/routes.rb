Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Main app entrypoint: form to build a cart.
  root "carts#new"

  # Cart workflow routes:
  # - new/create: launch build (now using background job)
  # - show: display cached execution result
  # - status: JSON endpoint for polling job progress
  # Future extension: expose JSON API endpoints for AI agents.
  resources :carts, only: [ :new, :create, :show ] do
    member do
      get :status
    end
  end
end
