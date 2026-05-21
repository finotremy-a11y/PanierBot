module Users
  class SessionsController < Devise::SessionsController
    respond_to :html, :turbo_stream
  end
end