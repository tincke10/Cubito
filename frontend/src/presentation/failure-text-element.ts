import type { FailureMessage } from '../application/i18n/user-facing-error'

/** Lead line as the element's own text, the engine detail as a muted block child; null clears. */
export function renderFailureText(
  doc: Document,
  element: HTMLElement,
  failure: FailureMessage | null,
  prefix = ''
): void {
  element.textContent = failure === null ? prefix : `${prefix}${failure.lead}`
  if (failure?.detail == null) return
  const detailLine = doc.createElement('span')
  detailLine.className = 'cubito-failure__detail'
  detailLine.textContent = failure.detail
  element.appendChild(detailLine)
}
