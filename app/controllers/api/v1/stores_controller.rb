class Api::V1::StoresController < Api::V1::BaseController
  def index
    render json: { stores: StoreRegistry.available_stores }, status: :ok
  end
end
