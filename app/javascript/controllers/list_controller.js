// list_controller.js — manages the dynamic items list in the comparison form
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["container", "item", "input", "hidden"]

  connect() {
    this.syncHidden()
  }

  addItem() {
    const count = this.itemTargets.length + 1
    const template = this.buildItem(count)
    this.containerTarget.insertAdjacentHTML("beforeend", template)
    // Focus the new input
    const inputs = this.containerTarget.querySelectorAll("[data-list-target='input']")
    inputs[inputs.length - 1]?.focus()
    this.renumber()
    this.syncHidden()
  }

  removeItem(event) {
    const row = event.currentTarget.closest("[data-list-target='item']")
    if (!row) return
    // Keep at least one row
    if (this.itemTargets.length <= 1) {
      const input = row.querySelector("[data-list-target='input']")
      if (input) { input.value = ""; input.focus() }
      return
    }
    row.remove()
    this.renumber()
    this.syncHidden()
  }

  // Sync the hidden textarea on every input change
  inputChanged() {
    this.syncHidden()
  }

  renumber() {
    this.itemTargets.forEach((row, index) => {
      const badge = row.querySelector("[data-badge]")
      if (badge) badge.textContent = index + 1
    })
  }

  syncHidden() {
    if (!this.hasHiddenTarget) return
    const values = this.inputTargets
      .map(i => i.value.trim())
      .filter(v => v.length > 0)
    this.hiddenTarget.value = values.join("\n")
  }

  buildItem(number) {
    return `
      <div class="flex items-center gap-2" data-list-target="item">
        <span data-badge class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">${number}</span>
        <input type="text" name="comparison[items_text][]"
               placeholder="Ex: lait demi-écrémé"
               class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 transition"
               data-list-target="input"
               data-action="input->list#inputChanged">
        <button type="button" data-action="click->list#removeItem"
                class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                aria-label="Supprimer">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>`
  }
}
