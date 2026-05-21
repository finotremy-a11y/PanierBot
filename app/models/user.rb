class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable

  enum :plan, { free: "free", premium: "premium" }, default: :free, validate: true

  has_many :comparison_usages, dependent: :destroy

  MONTHLY_COMPARISON_LIMIT = 2
  PRODUCTS_PER_COMPARISON_LIMIT = 20

  def monthly_comparison_limit
    return Float::INFINITY unless free?

    MONTHLY_COMPARISON_LIMIT
  end

  def products_per_comparison_limit
    return Float::INFINITY unless free?

    PRODUCTS_PER_COMPARISON_LIMIT
  end

  def allows_multi_store?
    premium?
  end

  def priority_speed?
    premium?
  end
end
