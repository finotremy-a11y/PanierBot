class UsageController < ApplicationController
  before_action :authenticate_user!

  def show
    @usage = ComparisonUsage.for_user_and_month(current_user)
    @remaining = if current_user.free?
      [ User::MONTHLY_COMPARISON_LIMIT - @usage.comparisons_count, 0 ].max
    else
      "Illimité"
    end
  end
end
