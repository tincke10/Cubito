import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf-8')

const ruleBody = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, selector).not.toBeNull()
  return match![1]!
}

const KEYBAR_CLEARANCE = 'var(--cubito-keyboard-bar-h)'

describe('diff composer vs the fixed keyboard bar (900x700 overlap)', () => {
  it('reserves at least the key bar footprint (bottom offset + chip height)', () => {
    const reserved = Number(/--cubito-keyboard-bar-h:\s*(\d+)px/.exec(css)?.[1])
    const keyBarBottom = Number(/#keyboard-bar\s*\{[^}]*bottom:\s*(\d+)px/.exec(css)?.[1])
    expect(reserved).toBeGreaterThanOrEqual(keyBarBottom + 24)
  })

  it('lifts the composer above the key bar instead of anchoring it at bottom: 0', () => {
    expect(ruleBody('.cubito-source-control')).toContain(`bottom: ${KEYBAR_CLEARANCE}`)
  })

  it('shrinks the file rail by the composer height AND the clearance, in both composer heights', () => {
    expect(ruleBody('#diff .cubito-diff-rail')).toContain(
      `calc(100% - var(--cubito-diff-composer-h) - ${KEYBAR_CLEARANCE})`
    )
    expect(ruleBody('#diff:has(.cubito-source-control--review) .cubito-diff-rail')).toContain(
      `calc(100% - var(--cubito-diff-composer-review-h) - ${KEYBAR_CLEARANCE})`
    )
  })
})
