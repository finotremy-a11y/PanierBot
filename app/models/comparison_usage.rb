class ComparisonUsage < ApplicationRecord
  belongs_to :user

  validates :period_start, presence: true
  validates :comparisons_count, numericality: { greater_than_or_equal_to: 0 }
  validates :products_count, numericality: { greater_than_or_equal_to: 0 }

  scope :for_month, ->(month_start) { where(period_start: month_start) }

  def self.for_user_and_month(user, month_start = Time.zone.today.beginning_of_month)
    user.comparison_usages.find_or_create_by!(period_start: month_start)
  end
end