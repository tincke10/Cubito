type EditorKeyEvent = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** ⌘S on Mac, Ctrl+S elsewhere — never the other platform's modifier. */
export function isSaveChord(event: EditorKeyEvent, platform: { isMac: boolean }): boolean {
  return (
    event.key.toLowerCase() === 's' &&
    !event.shiftKey &&
    !event.altKey &&
    (platform.isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  )
}

export function isIndentKey(event: EditorKeyEvent): boolean {
  return event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
}
