class StrategyEngine
  STRATEGIES = %w[cheapest best_per_kg per_unit best_per_l].freeze

  def initialize(products)
    @products = Array(products).map { |p| normalize_product(p) }
  end

  def compute_cheapest
    pick_by_metric(:price)
  end

  def compute_best_per_kg
    pick_by_metric(:price_per_kg)
  end

  def compute_per_unit
    pick_by_metric(:price_per_unit)
  end

  def compute_best_per_l
    pick_by_metric(:price_per_l)
  end

  def compute(strategy)
    case strategy.to_s
    when "cheapest" then compute_cheapest
    when "best_per_kg" then compute_best_per_kg
    when "per_unit" then compute_per_unit
    when "best_per_l" then compute_best_per_l
    else
      compute_cheapest
    end
  end

  private

  def pick_by_metric(metric)
    candidates = @products.select do |product|
      metric_value = to_number(product[metric])
      price_value = to_number(product[:price])

      metric_value && metric_value.positive? && price_value && price_value.positive?
    end

    candidates.min_by { |product| [ product[metric].to_f, product[:price].to_f ] }
  end

  def normalize_product(product)
    hash = product.to_h.symbolize_keys
    {
      id: hash[:id],
      name: hash[:name],
      price: to_number(hash[:price]),
      price_per_kg: to_number(hash[:price_per_kg]),
      price_per_unit: to_number(hash[:price_per_unit]),
      price_per_l: to_number(hash[:price_per_l]),
      store: hash[:store]
    }
  end

  def to_number(value)
    num = Float(value)
    num.finite? ? num : nil
  rescue ArgumentError, TypeError
    nil
  end
end