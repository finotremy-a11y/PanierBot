# syntax=docker/dockerfile:1
# check=error=true

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.4.2

# ----------------------------------------------------------------------------
# Stage 1: Rails build
# ----------------------------------------------------------------------------
FROM docker.io/library/ruby:${RUBY_VERSION}-slim AS rails-build

WORKDIR /rails

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential \
      curl \
      git \
      libjemalloc2 \
      libvips \
      libyaml-dev \
      pkg-config \
      sqlite3 && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

COPY vendor/* ./vendor/
COPY Gemfile Gemfile.lock ./

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile -j 1 --gemfile

COPY . .

RUN bundle exec bootsnap precompile -j 1 app/ lib/
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile


# ----------------------------------------------------------------------------
# Stage 2: Playwright + Chrome stable
# ----------------------------------------------------------------------------
FROM docker.io/library/ruby:${RUBY_VERSION}-slim AS playwright-chrome

WORKDIR /rails

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      ca-certificates \
      curl \
      gnupg \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libjemalloc2 \
      libnspr4 \
      libnss3 \
      libu2f-udev \
      libvips \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      sqlite3 \
      wget \
      xdg-utils && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

RUN set -eux; \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /tmp/nodesource.gpg.key; \
    gpg --dearmor -o /usr/share/keyrings/nodesource.gpg /tmp/nodesource.gpg.key; \
    echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list; \
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub -o /tmp/google-linux-signing-key.pub; \
    gpg --dearmor -o /usr/share/keyrings/google-linux.gpg /tmp/google-linux-signing-key.pub; \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list; \
    apt-get update -qq; \
    apt-get install --no-install-recommends -y google-chrome-stable nodejs; \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives /tmp/nodesource.gpg.key /tmp/google-linux-signing-key.pub

COPY playwright/package*.json /rails/playwright/
RUN npm --prefix /rails/playwright ci --omit=dev


# ----------------------------------------------------------------------------
# Stage 3: Final runner
# ----------------------------------------------------------------------------
FROM playwright-chrome AS runner

ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so" \
    PANIERBOT_CDP_URL="http://localhost:9222"

RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    mkdir -p /var/log/agent && \
    chown -R rails:rails /var/log/agent

COPY --chown=rails:rails --from=rails-build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=rails-build /rails /rails
COPY --chown=rails:rails --from=playwright-chrome /rails/playwright/node_modules /rails/playwright/node_modules

USER 1000:1000

ENTRYPOINT ["/rails/bin/docker-entrypoint"]

EXPOSE 80
EXPOSE 9222
CMD ["./bin/thrust", "./bin/rails", "server"]
