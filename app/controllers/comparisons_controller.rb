class ComparisonsController < ApplicationController
  STRATEGIES = %w[cheapest best_per_kg per_unit best_per_l].freeze
  MODES      = %w[single_store multi_store].freeze
  STORES     = %w[leclerc carrefour intermarche superu].freeze

  def show
    @result = Rails.cache.read(cache_key_for(params[:id]))

    return if @result.present?

    @result = {
      success:    false,
      processing: false,
      errors:     [ "Résultat introuvable ou expiré. Merci de relancer la comparaison." ]
    }
  end

  def create
    items    = parse_items(comparison_params[:items_text])
    strategy = normalize_strategy(comparison_params[:strategy])
    mode     = normalize_mode(comparison_params[:mode])
    store    = comparison_params[:store].to_s.downcase.presence
    city     = comparison_params[:city].presence || "Paris"

    if items.empty?
      return render_validation_error("Veuillez saisir au moins un produit.")
    end

    result_id = SecureRandom.uuid

    Rails.logger.info(
      "[ComparisonsController] Launching job result_id=#{result_id} mode=#{mode} " \
      "store=#{store.inspect} items_count=#{items.size} strategy=#{strategy}"
    )

    BuildComparisonJob.perform_later(result_id, items, strategy, mode, store, city)

    Rails.cache.write(
      cache_key_for(result_id),
      { processing: true, mode:, strategy:, items:, store:, city: },
      expires_in: 30.minutes
    )

    respond_to do |format|
      format.html { redirect_to comparison_path(result_id) }
      format.json { render json: { id: result_id, redirect: comparison_path(result_id) } }
      format.turbo_stream { redirect_to comparison_path(result_id) }
    end
  rescue StandardError => e
    Rails.logger.error("[ComparisonsController] create failed: #{e.class} – #{e.message}")
    result_id = SecureRandom.uuid
    Rails.cache.write(
      cache_key_for(result_id),
      { success: false, processing: false, errors: [ "Erreur: #{e.message}" ] },
      expires_in: 30.minutes
    )
    redirect_to comparison_path(result_id)
  end

  def status
    result = Rails.cache.read(cache_key_for(params[:id]))

    if result.nil?
      render json: { ready: false, processing: false, success: false }
    elsif result[:processing]
      render json: { ready: false, processing: true, success: false }
    else
      render json: { ready: true, processing: false, success: result[:success] }
    end
  end

  private

  def comparison_params
    params.require(:comparison).permit(:strategy, :mode, :store, :city, items_text: [])
  end

  def parse_items(text)
    case text
    when Array
      text.flat_map { |t| t.to_s.lines.map(&:strip) }.reject(&:empty?)
    when String
      text.lines.map(&:strip).reject(&:empty?)
    else
      []
    end
  end

  def normalize_strategy(raw)
    s = raw.to_s.downcase
    STRATEGIES.include?(s) ? s : "cheapest"
  end

  def normalize_mode(raw)
    m = raw.to_s.downcase
    MODES.include?(m) ? m : "multi_store"
  end

  def render_validation_error(message)
    respond_to do |format|
      format.html { redirect_to home_path, alert: message }
      format.json { render json: { errors: [ message ] }, status: :unprocessable_entity }
    end
  end

  def cache_key_for(id)
    "comparison_result:#{id}"
  end
end
