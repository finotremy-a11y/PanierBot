// compare_controller.js — handles form submit loading state + polling for results
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["submitBtn", "btnText", "btnLoading"]
  static values = {
    pollingUrl: String,
    redirectUrl: String,
    autoPoll: { type: Boolean, default: false },
  }

  connect() {
    if (this.autoPollValue && this.pollingUrlValue) {
      this.startPolling()
    }
  }

  disconnect() {
    this.stopPolling()
  }

  // Called on form submit
  submit(_event) {
    // Collect items from list inputs before submit
    const container = this.element.querySelector("[data-controller='list']")
    if (container) {
      const inputs = container.querySelectorAll("input[name='comparison[items_text][]']")
      const hidden = container.querySelector("#items_hidden")
      if (hidden) {
        hidden.value = Array.from(inputs)
          .map((i) => i.value.trim())
          .filter(Boolean)
          .join("\n")
      }
    }
    this.#setLoading(true)
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  startPolling() {
    if (this.#pollingTimer) return
    this.#pollOnce() // immediate first check
    this.#pollingTimer = setInterval(() => this.#pollOnce(), 2500)
  }

  stopPolling() {
    if (this.#pollingTimer) {
      clearInterval(this.#pollingTimer)
      this.#pollingTimer = null
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  #pollingTimer = null

  async #pollOnce() {
    if (!this.pollingUrlValue) return
    try {
      const response = await fetch(this.pollingUrlValue, {
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      })
      if (!response.ok) return
      const data = await response.json()

      if (!data.processing) {
        this.stopPolling()
        if (this.redirectUrlValue) {
          window.location.href = this.redirectUrlValue
        } else {
          window.location.reload()
        }
      }
    } catch (_err) {
      // Network errors are non-fatal during polling
    }
  }

  #setLoading(loading) {
    if (this.hasSubmitBtnTarget) this.submitBtnTarget.disabled = loading
    if (this.hasBtnTextTarget) this.btnTextTarget.classList.toggle("hidden", loading)
    if (this.hasBtnLoadingTarget) this.btnLoadingTarget.classList.toggle("hidden", !loading)
  }
}
