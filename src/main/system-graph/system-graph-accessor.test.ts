import { describe, expect, it } from 'vitest'
import { getSystemGraph } from './system-graph-accessor'
import { getSystemGraphService, type SystemGraphHost } from './system-graph-service'
import { emptyEngineSystemGraph } from './system-graph-model'

function fakeHost(): SystemGraphHost {
  return {
    resolveWorktree: () => null,
    getFilesystemProvider: () => undefined,
    watchWorktreeFiles: async () => async () => {},
    listLiveWorktreeIds: () => new Set()
  }
}

describe('getSystemGraph', () => {
  it('returns an empty graph when nothing has been built for the worktree', () => {
    const runtime = fakeHost()
    expect(getSystemGraph(runtime, 'unbuilt')).toEqual(emptyEngineSystemGraph())
  })

  it('returns the stored graph once the service has built one', async () => {
    const runtime: SystemGraphHost = {
      resolveWorktree: (worktreeId) =>
        worktreeId === 'w1' ? { rootPath: '/repo/plain-app', connectionId: 'ssh-1' } : null,
      getFilesystemProvider: () => ({
        readDir: async () => [],
        readFile: async () => ({ content: '{}', isBinary: false }),
        stat: async () => ({ size: 2, type: 'file', mtime: 0 }),
        writeFile: async () => {},
        writeFileBase64: async () => {},
        writeFileBase64Chunk: async () => {},
        deletePath: async () => {},
        createFile: async () => {},
        createDir: async () => {},
        createDirNoClobber: async () => {},
        rename: async () => {},
        renameNoClobber: async () => {},
        copy: async () => {},
        realpath: async (p: string) => p,
        search: async () => ({ results: [], truncated: false }) as never,
        listFiles: async () => [],
        watch: async () => () => {}
      }),
      watchWorktreeFiles: async () => async () => {},
      listLiveWorktreeIds: () => new Set(['w1'])
    }

    await getSystemGraphService(runtime).buildGraph('w1')

    // package.json has no express dep, so the framework detector yields the empty graph —
    // still a real stored value (distinct object identity), proving the accessor reads it.
    expect(getSystemGraph(runtime, 'w1')).toEqual(emptyEngineSystemGraph())
    expect(getSystemGraph(runtime, 'w1')).toBe(getSystemGraphService(runtime).getGraph('w1'))
  })
})
