import { splitFailureText } from '../application/i18n/user-facing-error'

/** Lead line as the element's own text, the engine detail as a muted block child. */
export function renderFailureText(
  doc: Document,
  element: HTMLElement,
  text: string,
  prefix = ''
): void {
  const { lead, detail } = splitFailureText(text)
  element.textContent = `${prefix}${lead}`
  if (detail === null) return
  const detailLine = doc.createElement('span')
  detailLine.className = 'cubito-failure__detail'
  detailLine.textContent = detail
  element.appendChild(detailLine)
}
