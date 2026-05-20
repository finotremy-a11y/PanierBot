// Form counter controller
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.updateCount()
    this.element.addEventListener("input", () => this.updateCount())
  }

  updateCount() {
    const items = this.element.value
      .trim()
      .split("\n")
      .filter(line => line.trim())
    
    const counter = document.getElementById("item-count")
    if (counter) {
      counter.textContent = items.length
    }
  }
}
