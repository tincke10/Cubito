import { describe, expect, it, vi } from 'vitest'
import { createFilesMethods } from './orcad-files-gateway'
import type { RpcCaller } from './orcad-gateway'

const frame = (result: unknown) => ({
  id: 'x',
  ok: true as const,
  result,
  _meta: { runtimeId: 'rt' }
})

describe('createFilesMethods — filesSearchPaths', () => {
  it('asks for a quick-open search with the clamped limit', async () => {
    const call = vi.fn<RpcCaller>(async () =>
      frame({
        files: [
          { relativePath: 'src/a.ts', basename: 'a.ts', kind: 'text' },
          { relativePath: 'logo.png', basename: 'logo.png', kind: 'binary' }
        ],
        totalCount: 9,
        truncated: true
      })
    )
    const result = await createFilesMethods({ call }).filesSearchPaths('r::/w', 'a', 99)
    expect(call).toHaveBeenCalledWith('files.searchPaths', {
      worktree: 'r::/w',
      query: 'a',
      limit: 32,
      mode: 'quick-open'
    })
    expect(result).toEqual({
      files: [
        { relativePath: 'src/a.ts', basename: 'a.ts', binary: false },
        { relativePath: 'logo.png', basename: 'logo.png', binary: true }
      ],
      truncated: true
    })
  })

  it('defaults the limit and drops malformed rows', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({ files: [{ nope: 1 }, 'x'] }))
    const result = await createFilesMethods({ call }).filesSearchPaths('w', 'q')
    expect(call).toHaveBeenCalledWith('files.searchPaths', expect.objectContaining({ limit: 20 }))
    expect(result).toEqual({ files: [], truncated: false })
  })
})

describe('createFilesMethods — filesRead', () => {
  it('projects content, truncation and byte length', async () => {
    const call = vi.fn<RpcCaller>(async () =>
      frame({ content: 'hi', truncated: true, byteLength: 4000000 })
    )
    await expect(createFilesMethods({ call }).filesRead('w', 'a.txt')).resolves.toEqual({
      content: 'hi',
      truncated: true,
      byteLength: 4000000
    })
    expect(call).toHaveBeenCalledWith('files.read', {
      worktree: 'w',
      relativePath: 'a.txt'
    })
  })

  it('throws when the host returns no text content', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({}))
    await expect(createFilesMethods({ call }).filesRead('w', 'a')).rejects.toThrow(/files\.read/)
  })
})

describe('createFilesMethods — filesStat / filesWrite', () => {
  it('projects size and mtime', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({ size: 3, isDirectory: false, mtime: 1.5 }))
    await expect(createFilesMethods({ call }).filesStat('w', 'a')).resolves.toEqual({
      size: 3,
      mtime: 1.5
    })
    expect(call).toHaveBeenCalledWith('files.stat', {
      worktree: 'w',
      relativePath: 'a'
    })
  })

  it('rejects a stat reply without numeric size and mtime', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({ size: 'x' }))
    await expect(createFilesMethods({ call }).filesStat('w', 'a')).rejects.toThrow(/files\.stat/)
  })

  it('writes the whole content', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({ ok: true }))
    await createFilesMethods({ call }).filesWrite('w', 'a', 'body')
    expect(call).toHaveBeenCalledWith('files.write', {
      worktree: 'w',
      relativePath: 'a',
      content: 'body'
    })
  })

  it('pins the executing host: the host rejects mutations without expectedExecutionHostId', async () => {
    const call = vi.fn<RpcCaller>(async () => frame({ ok: true }))
    await createFilesMethods({ call }).filesWrite('w', 'a', 'body', 'local')
    expect(call).toHaveBeenCalledWith('files.write', {
      worktree: 'w',
      relativePath: 'a',
      content: 'body',
      expectedExecutionHostId: 'local'
    })
  })
})
