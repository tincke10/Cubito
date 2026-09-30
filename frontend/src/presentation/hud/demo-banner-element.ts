/** Loud, unmissable copy: sample data must never pass for the live runtime. */
export const demoBannerText = (reason: string): string =>
  `MODO DEMO — datos de ejemplo, sin conexión a orcad (${reason}). Abrí la URL de pairing para conectar.`

/** Inert fixed banner shown for the whole session when the page booted without a valid pairing. */
export function createDemoBanner(doc: Document, reason: string): HTMLElement {
  const banner = doc.createElement('div')
  banner.className = 'cubito-demo-banner'
  banner.setAttribute('role', 'alert')
  banner.textContent = demoBannerText(reason)
  return banner
}
