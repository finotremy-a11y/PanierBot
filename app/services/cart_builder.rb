require "json"
require "open3"
require "timeout"

# CartBuilder is the Ruby bridge between Rails and the Playwright Node script.
# It validates input, runs Node with a timeout, parses JSON output, and
# normalizes the response for the controller/view layer.
class CartBuilder
  STORES = [ "leclerc", "carrefour", "intermarche" ].freeze
  STRATEGIES = [ "cheapest", "best_per_kg" ].freeze
  # 300s = 5 min : la boucle agent peut traiter jusqu'à 200 itérations;
  # un panier de 5 articles avec popups peut dépasser 2 minutes facilement.
  NODE_TIMEOUT_SECONDS = 300

  def initialize(store:, items:, strategy: "cheapest")
    @store = store.to_s.downcase
    @items = Array(items).map(&:to_s).map(&:strip).reject(&:empty?)
    @strategy = normalize_strategy(strategy)
  end

  def call
    validation_errors = validate
    return failure(validation_errors) if validation_errors.any?

    execution = run_node_script
    return execution if execution[:success] == false && execution[:details].is_a?(Hash) && execution[:details][:execution_failure]

    parse_script_output(execution[:stdout], execution[:stderr], execution[:status])
  rescue StandardError => e
    Rails.logger.error("[CartBuilder] Unexpected service error: #{e.class} - #{e.message}")
    failure([ "Erreur service CartBuilder: #{e.message}" ])
  end

  private

  def validate
    errors = []
    errors << "Enseigne non supportee" unless STORES.include?(@store)
    errors << "La liste de courses est vide" if @items.empty?
    errors << "Strategie non supportee" unless STRATEGIES.include?(@strategy)
    errors
  end

  def normalize_strategy(raw_strategy)
    strategy = raw_strategy.to_s.downcase
    STRATEGIES.include?(strategy) ? strategy : "cheapest"
  end

  def command
    [
      "node",
      Rails.root.join("playwright", "build_cart.js").to_s,
      "--store",
      @store,
      "--items",
      JSON.generate(@items),
      "--strategy",
      @strategy
    ]
  end

  def run_node_script
    stdout_data = +""
    stderr_data = +""
    exit_status = nil

    Open3.popen3(*command, pgroup: true) do |stdin, stdout, stderr, wait_thr|
      stdin.close

      stdout_reader = Thread.new { stdout.read.to_s }
      stderr_reader = Thread.new { stderr.read.to_s }

      if wait_thr.join(NODE_TIMEOUT_SECONDS)
        exit_status = wait_thr.value
      else
        Rails.logger.error("[CartBuilder] Node script timeout after #{NODE_TIMEOUT_SECONDS}s for store=#{@store}")
        kill_process_group(wait_thr.pid)
      end

      stdout_data = stdout_reader.value
      stderr_data = stderr_reader.value

      if exit_status.nil?
        exit_status = wait_thr.value rescue nil
      end
    end

    {
      stdout: stdout_data,
      stderr: stderr_data,
      status: exit_status
    }
  rescue StandardError => e
    Rails.logger.error("[CartBuilder] Failed to execute Node script: #{e.class} - #{e.message}")
    failure([ "Impossible d'executer le script Node" ], execution_failure: true)
  end

  def kill_process_group(pid)
    Process.kill("TERM", -pid)
    sleep 0.4
    Process.kill("KILL", -pid)
  rescue Errno::ESRCH
    nil
  rescue StandardError => e
    Rails.logger.error("[CartBuilder] Could not fully stop Node process group #{pid}: #{e.message}")
  end

  def parse_script_output(stdout, stderr, status)
    unless status&.success?
      stderr_message = stderr.to_s.strip
      stdout_message = stdout.to_s.strip
      parsed_failure = extract_json_payload(stdout)

      Rails.logger.error(
        "[CartBuilder] Node script failed status=#{status&.exitstatus} store=#{@store} stderr=#{stderr_message.inspect} stdout=#{stdout_message.inspect}"
      )

      if parsed_failure
        return {
          success: parsed_failure[:success] == true,
          url: parsed_failure[:url],
          errors: Array(parsed_failure[:errors]),
          store: parsed_failure[:store] || @store,
          items: Array(parsed_failure[:items]).presence || @items,
          details: (parsed_failure[:details].is_a?(Hash) ? parsed_failure[:details] : {}).merge(status_code: status&.exitstatus)
        }
      end

      message = stderr_message.presence || stdout_message.presence || "erreur inconnue"
      return failure([ "Script Node en echec: #{message}" ], status_code: status&.exitstatus)
    end

    parsed = extract_json_payload(stdout)
    unless parsed
      Rails.logger.error("[CartBuilder] Node output was not valid JSON. stdout=#{stdout.to_s.inspect}")
      return failure([ "Le script Node n'a pas renvoye de JSON valide" ])
    end

    {
      success: parsed[:success] == true,
      url: parsed[:url],
      errors: Array(parsed[:errors]),
      store: parsed[:store] || @store,
      items: Array(parsed[:items]).presence || @items,
      details: parsed[:details].is_a?(Hash) ? parsed[:details] : {}
    }
  end

  def extract_json_payload(stdout)
    lines = stdout.to_s.lines.map(&:strip).reject(&:empty?)
    lines.reverse_each do |line|
      next unless line.start_with?("{") && line.end_with?("}")

      return JSON.parse(line, symbolize_names: true)
    rescue JSON::ParserError
      next
    end

    nil
  end

  def failure(errors, extra = {})
    {
      success: false,
      url: nil,
      errors: Array(errors),
      store: @store,
      items: @items,
      details: extra
    }
  end
end
