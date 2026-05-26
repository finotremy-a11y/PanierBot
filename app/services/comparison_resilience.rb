require "digest"

class ComparisonResilience
  DEFAULT_RESULT_CACHE_TTL = 15.minutes
  DEFAULT_QUEUE_SLOT_TTL = 20.minutes
  DEFAULT_MAX_INFLIGHT = 2

  class << self
    def build_signature(items:, strategy:, mode:, store: nil, city: nil)
      normalized_items = Array(items).map { |item| normalize_text(item) }.reject(&:blank?).sort
      payload = [
        "items=#{normalized_items.join('|')}",
        "strategy=#{normalize_text(strategy)}",
        "mode=#{normalize_text(mode)}",
        "store=#{normalize_text(store)}",
        "city=#{normalize_text(city)}"
      ].join(";")

      Digest::SHA256.hexdigest(payload)
    end

    def result_cache_key(signature, namespace: "generic")
      "comparison_result_cache:#{namespace}:#{signature}"
    end

    def fetch_cached_result(signature, namespace: "generic")
      return nil if signature.blank?
      return nil unless cache_enabled?

      cache_store.read(result_cache_key(signature, namespace: namespace))
    rescue StandardError
      nil
    end

    def write_cached_result(signature, result, namespace: "generic", expires_in: DEFAULT_RESULT_CACHE_TTL)
      return if signature.blank?
      return unless result.is_a?(Hash)
      return unless result[:success] == true
      return unless cache_enabled?

      payload = result.deep_dup
      payload[:cached_at] = Time.current.iso8601
      cache_store.write(result_cache_key(signature, namespace: namespace), payload, expires_in: expires_in)
    rescue StandardError => e
      Rails.logger.warn("[ComparisonResilience] write_cached_result failed: #{e.class} - #{e.message}")
    end

    def queue_slot_key
      "comparison:queue:inflight"
    end

    def acquire_queue_slot(max_inflight: ENV.fetch("COMPARISON_MAX_INFLIGHT", DEFAULT_MAX_INFLIGHT).to_i, ttl: DEFAULT_QUEUE_SLOT_TTL)
      return true unless queue_slot_enabled?

      limit = [ max_inflight.to_i, 1 ].max
      current = increment_counter(queue_slot_key, ttl: ttl)

      if current > limit
        decrement_counter(queue_slot_key)
        return false
      end

      true
    end

    def release_queue_slot
      return unless queue_slot_enabled?

      decrement_counter(queue_slot_key)
    end

    def allow_request?(scope:, identifier:, limit:, period: 1.minute)
      return true unless throttle_enabled?
      return true if identifier.blank?

      key = "comparison:throttle:#{scope}:#{identifier}"
      current = increment_counter(key, ttl: period)
      current <= limit.to_i
    end

    private

    def increment_counter(key, ttl:)
      value = cache_store.increment(key, 1, expires_in: ttl)
      if value.nil?
        cache_store.write(key, 1, expires_in: ttl)
        return 1
      end

      value.to_i
    rescue StandardError
      existing = cache_store.read(key).to_i
      updated = existing + 1
      cache_store.write(key, updated, expires_in: ttl)
      updated
    end

    def decrement_counter(key)
      value = cache_store.decrement(key, 1)
      return value.to_i if value

      existing = cache_store.read(key).to_i
      next_value = [ existing - 1, 0 ].max
      cache_store.write(key, next_value, expires_in: DEFAULT_QUEUE_SLOT_TTL)
      next_value
    rescue StandardError
      0
    end

    def cache_store
      @cache_store ||= begin
        if Rails.cache.is_a?(ActiveSupport::Cache::NullStore)
          ActiveSupport::Cache::MemoryStore.new
        else
          Rails.cache
        end
      end
    end

    def cache_enabled?
      return true unless Rails.env.test?

      ActiveModel::Type::Boolean.new.cast(ENV["ENABLE_COMPARISON_CACHE_IN_TEST"])
    end

    def queue_slot_enabled?
      return true unless Rails.env.test?

      ActiveModel::Type::Boolean.new.cast(ENV["ENABLE_QUEUE_SLOT_IN_TEST"])
    end

    def throttle_enabled?
      return true unless Rails.env.test?

      ActiveModel::Type::Boolean.new.cast(ENV["ENABLE_COMPARISON_THROTTLE_IN_TEST"])
    end

    def normalize_text(value)
      value.to_s.strip.downcase
    end
  end
end
