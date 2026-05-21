module QuotaEnforcement
  extend ActiveSupport::Concern

  def enforce_quota!(items:, mode:)
    return true unless current_user&.free?

    usage = ComparisonUsage.for_user_and_month(current_user)
    remaining = [ User::MONTHLY_COMPARISON_LIMIT - usage.comparisons_count, 0 ].max

    Rails.logger.warn("⚠️ Quota restant : #{remaining}")

    if remaining <= 0
      Rails.logger.warn("⛔ Limite atteinte")
      render_validation_error("Plan free: limite mensuelle atteinte (#{User::MONTHLY_COMPARISON_LIMIT} comparaisons/mois).")
      return false
    end

    if items.size > User::PRODUCTS_PER_COMPARISON_LIMIT
      Rails.logger.warn("⛔ Limite atteinte")
      render_validation_error("Plan free: maximum #{User::PRODUCTS_PER_COMPARISON_LIMIT} produits par comparaison.")
      return false
    end

    if mode == "multi_store"
      render_validation_error("Le plan free autorise uniquement le mode mono-magasin. Passez en Premium pour multi-magasins.")
      return false
    end

    true
  end

  def track_comparison_usage!(items_count:)
    return unless current_user&.free?

    usage = ComparisonUsage.for_user_and_month(current_user)
    usage.increment!(:comparisons_count)
    usage.increment!(:products_count, items_count)
  end
end
