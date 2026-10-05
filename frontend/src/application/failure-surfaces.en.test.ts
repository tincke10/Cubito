import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchWorkingTreeEntries } from './working-tree-entries-fetch'
import { setActiveLanguage } from './i18n/translate'

beforeEach(() => setActiveLanguage('en'))
afterEach(() => setActiveLanguage('es'))

describe('engine failures in English', () => {
  it('leads with the English action and keeps git text verbatim as detail', async () => {
    const result = await fetchWorkingTreeEntries(
      { gitStatus: () => Promise.reject(new Error('fatal: not a git repository')) },
      'repo::main'
    )
    expect(result).toEqual({
      outcome: 'failed',
      message: "couldn't read the git status\u001ffatal: not a git repository"
    })
  })
})
