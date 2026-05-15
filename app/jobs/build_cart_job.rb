class BuildCartJob < ApplicationJob
  queue_as :default

  def perform(result_id, store, items, strategy = "cheapest")
    Rails.logger.info("[BuildCartJob] Starting cart build result_id=#{result_id} store=#{store} items_count=#{items.size} strategy=#{strategy}")

    # Call CartBuilder service
    result = CartBuilder.new(store:, items:, strategy:).call
    result[:store] ||= store
    result[:items] ||= items

    # Store result in cache (30 minutes)
    Rails.cache.write(cache_key_for(result_id), result, expires_in: 30.minutes)

    Rails.logger.info("[BuildCartJob] Cart build completed result_id=#{result_id} success=#{result[:success]}")
  rescue StandardError => e
    Rails.logger.error("[BuildCartJob] Job failed result_id=#{result_id}: #{e.class} - #{e.message}")

    # Store error in cache
    Rails.cache.write(
      cache_key_for(result_id),
      {
        success: false,
        url: nil,
        store:,
        items:,
        errors: [ "Erreur lors de la construction du panier: #{e.message}" ],
        details: {}
      },
      expires_in: 30.minutes
    )
  end

  private

  def cache_key_for(id)
    "cart_result:#{id}"
  end
end
