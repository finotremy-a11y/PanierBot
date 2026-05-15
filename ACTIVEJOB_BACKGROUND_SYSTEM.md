# Système ActiveJob - Construction de Panier en Arrière-Plan

## 🎯 Vue d'ensemble

Implémentation d'un système de construction de panier **asynchrone** utilisant Rails ActiveJob, Redis, et polling côté client.

**Flux:**
1. Utilisateur soumet le formulaire
2. Job lancé en arrière-plan
3. Page affiche "Construction en cours…" avec spinner
4. JavaScript poll `/status` toutes les 2 secondes
5. Résultat affiché automatiquement quand prêt

## 📋 Composants implémentés

### 1. BuildCartJob (`app/jobs/build_cart_job.rb`)

Job ActiveJob qui:
- Reçoit: `result_id`, `store`, `items`, `strategy`
- Appelle: `CartBuilder.new(...).call`
- Stocke: Résultat dans `Rails.cache` (30 min)
- Gère: Erreurs avec fallback cache

```ruby
class BuildCartJob < ApplicationJob
  queue_as :default

  def perform(result_id, store, items, strategy = "cheapest")
    # 1. Call CartBuilder service
    result = CartBuilder.new(store:, items:, strategy:).call
    
    # 2. Store in cache
    Rails.cache.write(cache_key_for(result_id), result, expires_in: 30.minutes)
  rescue StandardError => e
    # 3. Store error in cache if job fails
    Rails.cache.write(cache_key_for(result_id), { success: false, errors: [...] })
  end
end
```

### 2. CartsController Modifications

#### Méthode `create` (modifiée)

**Avant:**
```ruby
result = CartBuilder.new(store:, items:, strategy:).call  # Synchrone
Rails.cache.write(..., result)
redirect_to cart_path(result_id)
```

**Après:**
```ruby
# Launch job in background
BuildCartJob.perform_later(result_id, store, items, strategy)

# Mark as processing in cache
Rails.cache.write(cache_key_for(result_id), { processing: true })

# Redirect immediately to show page
redirect_to cart_path(result_id)
```

#### Méthode `status` (nouvelle)

Endpoint JSON pour le polling:

```ruby
def status
  result = Rails.cache.read(cache_key_for(params[:id]))

  if result.nil?
    render json: { ready: false, processing: false }
  elsif result[:processing]
    render json: { ready: false, processing: true }
  else
    render json: { ready: true, processing: false, success: result[:success] }
  end
end
```

### 3. Routes (`config/routes.rb`)

Ajout route membre:

```ruby
resources :carts, only: [ :new, :create, :show ] do
  member do
    get :status
  end
end
```

Routes générées:
- `POST /carts` → create (lance le job)
- `GET /carts/:id` → show (affiche loading ou résultat)
- `GET /carts/:id/status` → status (retourne JSON)

### 4. Vue `show.html.erb` (modifiée)

#### État de chargement

```erb
<% if @result[:processing] %>
  <div class="bg-blue-50 p-6">
    <div class="animate-spin">⏳</div>
    <p>Panier en cours de construction…</p>
  </div>
<% end %>
```

#### Script de polling

```javascript
const cartId = '<%= params[:id] %>';
const statusUrl = `/carts/${cartId}/status`;
let pollCount = 0;
const maxPollCount = 300; // 10 minutes

function pollJobStatus() {
  fetch(statusUrl)
    .then(response => response.json())
    .then(data => {
      if (data.ready) {
        // Job complete - reload page
        window.location.reload();
      } else if (data.processing) {
        // Continue polling every 2 seconds
        pollCount++;
        if (pollCount < maxPollCount) {
          setTimeout(pollJobStatus, 2000);
        } else {
          alert('Timeout après 10 minutes');
        }
      }
    })
    .catch(error => {
      // Retry on error after 3 seconds
      if (pollCount < maxPollCount) {
        setTimeout(pollJobStatus, 3000);
      }
    });
}

// Start polling immediately
pollJobStatus();
```

## 🔄 Flux d'exécution

```
1. User submits form (POST /carts)
   ↓
2. CartsController#create
   - Generate UUID: result_id
   - Launch: BuildCartJob.perform_later(result_id, ...)
   - Cache: { processing: true }
   - Redirect: /carts/:id
   ↓
3. CartsController#show (rendered)
   - Read @result from cache
   - If processing: show loading screen
   - Include polling script
   ↓
4. Browser: polling loop (2 sec interval)
   - GET /carts/:id/status
   - If ready: window.location.reload()
   - Else: continue polling
   ↓
5. BuildCartJob#perform (background)
   - Call: CartBuilder.new(...).call
   - Write: result to cache (replaces { processing: true })
   ↓
6. Next poll detects ready=true
   - Page reloads
   - Now shows completed result
```

## 📊 Cache States

### State 1: Processing

```json
{
  "processing": true
}
```

**API Response:**
```json
{
  "ready": false,
  "processing": true
}
```

### State 2: Complete (Success)

```json
{
  "success": true,
  "url": "https://leclercdrive.fr/panier",
  "store": "leclerc",
  "items": ["pates", "lait"],
  "errors": [],
  "details": { ... }
}
```

**API Response:**
```json
{
  "ready": true,
  "processing": false,
  "success": true
}
```

### State 3: Complete (Failure)

```json
{
  "success": false,
  "errors": ["Playwright not installed"],
  "details": {}
}
```

**API Response:**
```json
{
  "ready": true,
  "processing": false,
  "success": false
}
```

## ⚙️ Configuration

### Rails Cache Backend

Default: `:memory_store` (in development)

For production, configure in `config/environments/production.rb`:

```ruby
# Redis cache (recommended)
config.cache_store = :redis_cache_store, { url: ENV['REDIS_URL'] }

# Or MemCached
config.cache_store = :mem_cache_store
```

### Job Queue Backend

Default: `:inline` (in development, runs synchronously)

For production, use in `config/environments/production.rb`:

```ruby
# Redis queue (recommended)
config.active_job.queue_adapter = :sidekiq

# Or other adapters
config.active_job.queue_adapter = :good_job
config.active_job.queue_adapter = :delayed_job
```

### Timeout & TTL

- Cache TTL: **30 minutes** (configurable in job)
- Polling interval: **2 seconds** (configurable in view)
- Polling timeout: **10 minutes** / 300 polls (configurable in JS)

## 🧪 Testing

### Test 1: Job Instantiation

```bash
bin/rails runner 'puts BuildCartJob.queue_name'
# Output: "default"
```

### Test 2: Cache Read/Write

```bash
bin/rails runner '
Rails.cache.write("test:key", { data: true }, expires_in: 1.minute)
puts Rails.cache.read("test:key")
'
```

### Test 3: Routes

```bash
bin/rails routes | grep cart
# POST /carts (create)
# GET /carts/:id (show)
# GET /carts/:id/status (status)
```

### Test 4: Manual Job Execution

```bash
bin/rails runner '
result_id = SecureRandom.uuid
BuildCartJob.perform_now(result_id, "leclerc", ["pates"], "cheapest")
puts Rails.cache.read("cart_result:#{result_id}")
'
```

## 📈 User Experience

### Before (Synchronous)

```
User clicks submit
    ↓
Page freezes during Node execution (120s max)
    ↓
Shows results
```

**Problem:** Long wait, browser unresponsive

### After (Asynchronous)

```
User clicks submit
    ↓
Immediately shows loading screen
    ↓
JS polls status every 2 seconds
    ↓
Auto-redirects when ready
```

**Benefits:**
- ✅ Instant feedback
- ✅ Responsive UI
- ✅ Can navigate away and come back
- ✅ Shareable link (result_id is UUID)
- ✅ Cache persists 30 minutes

## 🔧 Development

### Monitoring Background Jobs

Watch Rails logs:
```bash
tail -f log/development.log | grep -E "BuildCartJob|polling"
```

### Disable Background Jobs (force sync)

In development, jobs run inline by default. To test background behavior:

```ruby
# config/environments/development.rb
config.active_job.queue_adapter = :sidekiq
```

### Clear Cache

```bash
bin/rails runner 'Rails.cache.clear'
```

## 📋 Files Modified

```
✅ app/jobs/build_cart_job.rb (created)
✅ app/controllers/carts_controller.rb (create + status)
✅ app/views/carts/show.html.erb (processing state + polling JS)
✅ config/routes.rb (added member route)
```

## 🚀 Production Checklist

- [ ] Configure Rails cache backend (Redis recommended)
- [ ] Configure ActiveJob adapter (Sidekiq/GoodJob recommended)
- [ ] Set appropriate TTL for cache
- [ ] Monitor job queue size
- [ ] Add error tracking (Sentry/Rollbar)
- [ ] Set up job retry logic
- [ ] Configure polling timeout for frontend
- [ ] Load test polling endpoints
- [ ] Monitor memory usage during concurrent jobs

## 📚 Future Enhancements

- [ ] Real-time WebSocket updates instead of polling
- [ ] Job progress tracking (% items added)
- [ ] Cancel job button (if still processing)
- [ ] Retry mechanism for failed jobs
- [ ] Email notification when ready
- [ ] Analytics: job duration, success rate
- [ ] Admin panel: view job queue status
