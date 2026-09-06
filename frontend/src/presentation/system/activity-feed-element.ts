import type { ActivityFeedRowView } from './activity-feed-model'

const TITLE = 'actividad del agente'
const FOOTER_LABEL = 'escribiendo …'
const FOOTER_CURSOR_GLYPH = '▮'
const PLACEHOLDER_TEXT = 'aún no hay actividad'

const buildRow = (doc: Document, row: ActivityFeedRowView): HTMLElement => {
  const rowElement = doc.createElement('div')
  rowElement.className = [
    'cubito-activity-feed__row',
    row.cssClass,
    row.highlighted ? 'cubito-activity-feed__row--highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const time = doc.createElement('span')
  time.className = 'cubito-activity-feed__time'
  time.textContent = row.time

  const glyph = doc.createElement('span')
  glyph.className = 'cubito-activity-feed__glyph'
  glyph.textContent = row.glyph

  const text = doc.createElement('span')
  text.className = 'cubito-activity-feed__text'
  text.textContent = row.text

  rowElement.appendChild(time)
  rowElement.appendChild(glyph)
  rowElement.appendChild(text)

  if (row.detail !== undefined) {
    const detail = doc.createElement('div')
    detail.className = 'cubito-activity-feed__detail'
    detail.textContent = row.detail
    rowElement.appendChild(detail)
  }

  return rowElement
}

export type ActivityFeedHandle = {
  readonly element: HTMLElement
  apply(rows: readonly ActivityFeedRowView[]): void
  setSubtitle(subtitle: string | null): void
  dispose(): void
}

/**
 * Right-panel activity feed (design's "actividad del agente" dock): a static title/footer
 * shell built once, one row per activityFeedViewModel entry re-rendered on apply() — mirrors
 * command-palette-element.ts's rows.replaceChildren() pattern. No color literals: cssClass
 * passthrough only, styling lives in index.html.
 */
export function createActivityFeed(doc: Document = document): ActivityFeedHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-activity-feed'
  root.style.pointerEvents = 'auto'

  const header = doc.createElement('div')
  header.className = 'cubito-activity-feed__header'

  const title = doc.createElement('div')
  title.className = 'cubito-activity-feed__title'
  title.textContent = TITLE

  const subtitle = doc.createElement('div')
  subtitle.className = 'cubito-activity-feed__subtitle'

  header.appendChild(title)
  header.appendChild(subtitle)

  const rows = doc.createElement('div')
  rows.className = 'cubito-activity-feed__rows'

  const footer = doc.createElement('div')
  footer.className = 'cubito-activity-feed__footer'

  const cursor = doc.createElement('span')
  cursor.className = 'cubito-activity-feed__cursor pulse'
  cursor.textContent = FOOTER_CURSOR_GLYPH

  const footerLabel = doc.createElement('span')
  footerLabel.className = 'cubito-activity-feed__footer-label'
  footerLabel.textContent = FOOTER_LABEL

  footer.appendChild(cursor)
  footer.appendChild(footerLabel)

  const placeholder = doc.createElement('div')
  placeholder.className = 'cubito-activity-feed__placeholder'
  placeholder.textContent = PLACEHOLDER_TEXT
  placeholder.hidden = true

  root.appendChild(header)
  root.appendChild(rows)
  root.appendChild(footer)
  root.appendChild(placeholder)

  return {
    element: root,
    apply(rowViews: readonly ActivityFeedRowView[]) {
      rows.replaceChildren()
      for (const row of rowViews) {
        rows.appendChild(buildRow(doc, row))
      }
      const isEmpty = rowViews.length === 0
      placeholder.hidden = !isEmpty
      footer.hidden = isEmpty
    },
    setSubtitle(text: string | null) {
      subtitle.textContent = text ?? ''
    },
    dispose() {
      root.remove()
    }
  }
}
