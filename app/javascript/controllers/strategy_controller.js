// strategy_controller.js — visual feedback on strategy card selection
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["root"]

  connect() {
    // Initial sync in case browser restores selection
    this.#syncHighlight()
  }

  changed() {
    this.#syncHighlight()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #syncHighlight() {
    const radios = this.element.querySelectorAll("input[name='comparison[strategy]']")
    radios.forEach((radio) => {
      const label = radio.closest("label")
      if (!label) return
      // The Tailwind has-[:checked] handles the visual state, no class toggling needed.
      // This method exists as a hook for any additional JS logic in the future.
    })
  }
}
