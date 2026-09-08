import { describe, expect, it } from 'vitest'
import { didSceneModeClose } from './scene-mode-close-edge'

describe('didSceneModeClose', () => {
  it('is true exactly on the open->closed transition', () => {
    expect(didSceneModeClose(true, false)).toBe(true)
  })

  it('is false when it stays open', () => {
    expect(didSceneModeClose(true, true)).toBe(false)
  })

  it('is false when it stays closed', () => {
    expect(didSceneModeClose(false, false)).toBe(false)
  })

  it('is false on the closed->open transition', () => {
    expect(didSceneModeClose(false, true)).toBe(false)
  })
})
