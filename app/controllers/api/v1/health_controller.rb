class Api::V1::HealthController < Api::V1::BaseController
  def show
    report = HealthCheckService.new.call
    status = report[:healthy] ? :ok : :service_unavailable

    render json: report, status: status
  end
end
