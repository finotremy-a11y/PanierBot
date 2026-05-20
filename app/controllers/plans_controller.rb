class PlansController < ApplicationController
  before_action :authenticate_user!

  def index
    @plans = StripeService::PLAN_DEFINITIONS
  end
end