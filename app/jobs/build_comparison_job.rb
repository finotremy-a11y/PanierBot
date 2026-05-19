class BuildComparisonJob < ApplicationJob
  queue_as :default

  def perform(result_id, items, strategy, mode, store, city)
    Rails.logger.info(
      "[BuildComparisonJob] Starting result_id=#{result_id} mode=#{mode} " \
      "store=#{store.inspect} items_count=#{items.size} strategy=#{strategy}"
    )

    result = ComparisonBuilder.new(
      items:,
      strategy:,
      mode:,
      store:,
      city: city.presence || "Paris"
    ).call

    result[:mode]     ||= mode
    result[:strategy] ||= strategy
    result[:items]    ||= items

    Rails.cache.write(cache_key_for(result_id), result, expires_in: 30.minutes)

    Rails.logger.info(
      "[BuildComparisonJob] Completed result_id=#{result_id} success=#{result[:success]}"
    )
  rescue StandardError => e
    Rails.logger.error("[BuildComparisonJob] Failed result_id=#{result_id}: #{e.class} – #{e.message}")

    Rails.cache.write(
      cache_key_for(result_id),
      {
        success:    false,
        processing: false,
        mode:,
        strategy:,
        items:,
        errors:     [ "Erreur lors de la comparaison: #{e.message}" ]
      },
      expires_in: 30.minutes
    )
  end

  private

  def cache_key_for(id)
    "comparison_result:#{id}"
  end
end
