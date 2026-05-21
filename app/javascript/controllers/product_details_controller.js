// product_details_controller.js — toggles the details panel in product cards
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["panel", "icon", "trigger"]

  connect() {
    this.#isOpen = false
  }

  toggle() {
    this.#isOpen = !this.#isOpen
    const panel = this.panelTarget

    if (this.#isOpen) {
      panel.style.maxHeight = panel.scrollHeight + "px"
      panel.style.opacity = "1"
      if (this.hasIconTarget) this.iconTarget.style.transform = "rotate(180deg)"
    } else {
      panel.style.maxHeight = "0"
      panel.style.opacity = "0"
      if (this.hasIconTarget) this.iconTarget.style.transform = "rotate(0deg)"
    }
  }

  #isOpen = false
}
