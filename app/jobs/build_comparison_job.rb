class BuildComparisonJob < ApplicationJob
  queue_as :default

  def perform(result_id, items, strategy, mode, store, city, signature = nil)
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
    ComparisonResilience.write_cached_result(signature, result, namespace: "web")

    anti_bot_error = Array(result[:errors]).find { |entry| entry.to_s.downcase.include?("anti-bot") || entry.to_s.downcase.include?("captcha") }
    if anti_bot_error.present?
      Rails.logger.warn("[BuildComparisonJob] Session alert result_id=#{result_id} error=#{anti_bot_error}")
    end

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
  ensure
    ComparisonResilience.release_queue_slot
  end

  private

  def cache_key_for(id)
    "comparison_result:#{id}"
  end
end
