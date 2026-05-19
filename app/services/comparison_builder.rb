require "json"
require "open3"
require "timeout"

# ComparisonBuilder bridges Rails to the Node.js comparison scripts.
# For single_store mode, it delegates to CartBuilder.
# For multi_store mode, it calls compare_stores.js which runs runGlobalAudit.
class ComparisonBuilder
  STRATEGIES = %w[cheapest best_per_kg per_unit best_per_l].freeze
  MODES      = %w[single_store multi_store].freeze
  STORES     = %w[leclerc carrefour intermarche superu].freeze

  NODE_TIMEOUT_SECONDS = 600 # 10 min: multi-store comparison across 4 stores takes longer

  def initialize(items:, strategy: "cheapest", mode: "multi_store", store: nil, city: "Paris")
    @items    = Array(items).map(&:to_s).map(&:strip).reject(&:empty?)
    @strategy = normalize_strategy(strategy)
    @mode     = normalize_mode(mode)
    @store    = store.to_s.downcase.presence
    @city     = city.to_s.presence || "Paris"
  end

  def call
    validation_errors = validate
    return failure(validation_errors) if validation_errors.any?

    if @mode == "single_store"
      call_single_store
    else
      call_multi_store
    end
  rescue StandardError => e
    Rails.logger.error("[ComparisonBuilder] Unexpected error: #{e.class} – #{e.message}")
    failure([ "Erreur ComparisonBuilder: #{e.message}" ])
  end

  private

  def validate
    errors = []
    errors << "La liste de courses est vide" if @items.empty?
    errors << "Stratégie non supportée"      unless STRATEGIES.include?(@strategy)
    errors << "Mode non supporté"            unless MODES.include?(@mode)
    errors << "Enseigne non supportée pour le mode mono-enseigne" if @mode == "single_store" && @store.present? && !STORES.include?(@store)
    errors
  end

  # Single-store: delegate to CartBuilder (existing battle-tested service)
  def call_single_store
    effective_store = STORES.include?(@store) ? @store : STORES.first
    result = CartBuilder.new(store: effective_store, items: @items, strategy: @strategy).call
    result.merge(mode: "single_store", city: @city, items: @items, strategy: @strategy)
  end

  # Multi-store: call compare_stores.js which wraps runGlobalAudit
  def call_multi_store
    stdout, stderr, status = run_node_script
    parse_output(stdout, stderr, status)
  end

  def node_command
    [
      "node",
      Rails.root.join("playwright", "compare_stores.js").to_s,
      "--items",   @items.join(","),
      "--strategy", @strategy,
      "--city",    @city
    ]
  end

  def run_node_script
    stdout_data = +""
    stderr_data = +""
    exit_status = nil

    Open3.popen3(*node_command, pgroup: true) do |stdin, stdout, stderr, wait_thr|
      stdin.close
      stdout_reader = Thread.new { stdout.read.to_s }
      stderr_reader = Thread.new { stderr.read.to_s }

      if wait_thr.join(NODE_TIMEOUT_SECONDS)
        exit_status = wait_thr.value
      else
        Rails.logger.error("[ComparisonBuilder] Node timeout after #{NODE_TIMEOUT_SECONDS}s")
        begin
          Process.kill("-TERM", wait_thr.pid)
        rescue StandardError
          nil
        end
      end

      stdout_data = stdout_reader.value
      stderr_data = stderr_reader.value
    end

    [ stdout_data, stderr_data, exit_status ]
  end

  def parse_output(stdout, stderr, status)
    json_str = extract_json_block(stdout)

    if json_str.blank?
      Rails.logger.error("[ComparisonBuilder] No JSON block in stdout. stderr=#{stderr.first(500)}")
      return failure([ "Pas de résultat JSON du script de comparaison." ])
    end

    data = JSON.parse(json_str, symbolize_names: true)

    if data[:success]
      {
        success:      true,
        processing:   false,
        mode:         data[:mode] || @mode,
        strategy:     data[:strategy] || @strategy,
        city:         data[:city] || @city,
        items:        @items,
        comparison:   {
          items:        Array(data[:items]),
          optimal_cart: data[:optimal_cart] || {}
        },
        errors:       []
      }
    else
      failure(Array(data[:errors]).presence || [ "La comparaison a échoué." ])
    end
  rescue JSON::ParserError => e
    Rails.logger.error("[ComparisonBuilder] JSON parse error: #{e.message}")
    failure([ "Erreur de lecture du résultat de comparaison." ])
  end

  def extract_json_block(text)
    match = text.match(/PANIERBOT_JSON_START\n(.*?)\nPANIERBOT_JSON_END/m)
    match ? match[1].strip : nil
  end

  def failure(errors)
    { success: false, processing: false, mode: @mode, strategy: @strategy, items: @items, errors: }
  end

  def normalize_strategy(raw)
    s = raw.to_s.downcase
    STRATEGIES.include?(s) ? s : "cheapest"
  end

  def normalize_mode(raw)
    m = raw.to_s.downcase
    MODES.include?(m) ? m : "multi_store"
  end
end
