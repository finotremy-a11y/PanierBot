// mode_controller.js — shows/hides the store selector based on mode radio selection
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["storeSelector"]

  connect() {
    this.#syncStoreSelector()
  }

  changed() {
    this.#syncStoreSelector()
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #syncStoreSelector() {
    const selected = this.element.querySelector("input[name='comparison[mode]']:checked")
    const isSingle = selected?.value === "single_store"
    this.storeSelectorTargets.forEach((el) => {
      el.classList.toggle("hidden", !isSingle)
    })
  }
}
