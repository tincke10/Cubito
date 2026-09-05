import type { HudChip } from './hud-model'

export type KeyboardBarHandle = {
  readonly root: HTMLElement
  apply(chips: readonly HudChip[]): void
  dispose(): void
}

/** Bottom keyboard bar, fed only by HudModel['chips']. Every chip is a plain, inert label. */
export function createKeyboardBar(doc: Document = document): KeyboardBarHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-keyboard-bar'
  root.style.pointerEvents = 'none'

  return {
    root,
    apply(chips: readonly HudChip[]) {
      root.replaceChildren()
      for (const chip of chips) {
        const chipElement = doc.createElement('div')
        chipElement.className = 'cubito-keychip'
        chipElement.style.pointerEvents = 'none'

        const key = doc.createElement('span')
        key.className = 'cubito-keychip__key'
        key.textContent = chip.key

        const description = doc.createElement('span')
        description.className = 'cubito-keychip__description'
        description.textContent = chip.description

        chipElement.appendChild(key)
        chipElement.appendChild(description)
        root.appendChild(chipElement)
      }
    },
    dispose() {
      root.remove()
    }
  }
}
