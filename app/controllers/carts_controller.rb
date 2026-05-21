# CartsController handles the user flow:
# 1) receive store + shopping list from the form
# 2) call CartBuilder service
# 3) persist the result in cache and display it with a shareable id
class CartsController < ApplicationController
  STORES = [ "leclerc", "carrefour", "intermarche" ].freeze
  STRATEGIES = [ "cheapest", "best_per_kg" ].freeze

  def new
    @stores = STORES
  end

  def create
    store = cart_params[:store].to_s.downcase
    items = parse_items(cart_params[:items_text])
    strategy = normalize_strategy(cart_params[:strategy])

    # Generate unique result ID
    result_id = SecureRandom.uuid

    Rails.logger.info(
      "[CartsController] Launching background job result_id=#{result_id} store=#{store} items_count=#{items.size} strategy=#{strategy}"
    )

    # Launch background job
    BuildCartJob.perform_later(result_id, store, items, strategy)

    # Mark as processing
    Rails.cache.write(cache_key_for(result_id), { processing: true }, expires_in: 30.minutes)

    # Redirect to show page (with polling)
    redirect_to cart_path(result_id)
  rescue StandardError => e
    Rails.logger.error("[CartsController] create failed: #{e.class} - #{e.message}")

    result_id = SecureRandom.uuid
    Rails.cache.write(
      cache_key_for(result_id),
      {
        success: false,
        url: nil,
        errors: [ "Erreur lors de la creation du panier: #{e.message}" ],
        details: {}
      },
      expires_in: 30.minutes
    )

    redirect_to cart_path(result_id)
  end

  def show
    @result = Rails.cache.read(cache_key_for(params[:id]))

    return if @result.present?

    @result = {
      success: false,
      url: nil,
      errors: [ "Resultat introuvable ou expire. Merci de relancer la creation du panier." ]
    }
  end

  def status
    result = Rails.cache.read(cache_key_for(params[:id]))

    if result.nil?
      # Job hasn't started or cache expired
      render json: { ready: false, processing: false }
    elsif result[:processing]
      # Job is running
      render json: { ready: false, processing: true }
    else
      # Job is complete
      render json: { ready: true, processing: false, success: result[:success] }
    end
  end

  private

  def cart_params
    if params.respond_to?(:expect)
      params.expect(cart: [ :store, :items_text, :strategy ])
    else
      params.require(:cart).permit(:store, :items_text, :strategy)
    end
  end

  def parse_items(items_text)
    items_text.to_s.lines.map(&:strip).reject(&:empty?)
  end

  def cache_key_for(result_id)
    "cart_result:#{result_id}"
  end

  def normalize_strategy(raw_strategy)
    strategy = raw_strategy.to_s.downcase
    STRATEGIES.include?(strategy) ? strategy : "cheapest"
  end
end
