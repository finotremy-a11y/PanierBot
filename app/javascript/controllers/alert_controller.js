// Alert dismissal controller
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  close() {
    this.element.style.opacity = "0"
    this.element.style.transform = "translateY(-10px)"
    setTimeout(() => {
      this.element.remove()
    }, 300)
  }
}
