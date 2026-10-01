import { describe, expect, it, vi } from 'vitest'
import { createFileEditorFlow } from './file-editor-flow'
import type { FileEditorView } from './file-editor-flow'

const stamp = { size: 5, mtime: 100 }

function setup(over: Partial<Parameters<typeof createFileEditorFlow>[0]['gateway']> = {}) {
  const gateway = {
    filesRead: vi.fn(async () => ({ content: 'hello', truncated: false, byteLength: 5 })),
    filesStat: vi.fn(async () => stamp),
    filesWrite: vi.fn(async () => undefined),
    ...over
  }
  const flow = createFileEditorFlow({ gateway, onSaved: vi.fn() })
  const views: FileEditorView[] = []
  flow.subscribe((view) => views.push(view))
  return { flow, gateway, views }
}

const open = (view: FileEditorView) => {
  if (view.phase !== 'open') throw new Error(`expected open, got ${view.phase}`)
  return view
}

describe('file editor flow — open', () => {
  it('shows a loading state, then the text of the file', async () => {
    const { flow, gateway, views } = setup()
    const pending = flow.open('r::/w', 'src/a.ts')
    expect(open(flow.view())).toMatchObject({
      status: 'loading',
      path: 'src/a.ts',
      nodeId: 'r::/w'
    })
    await pending
    expect(gateway.filesRead).toHaveBeenCalledWith('r::/w', 'src/a.ts')
    expect(open(flow.view())).toMatchObject({
      status: 'ready',
      content: 'hello',
      readOnly: null,
      error: null
    })
    expect(views.length).toBeGreaterThanOrEqual(2)
  })

  it('is read-only with a visible reason when the preview was truncated', async () => {
    const { flow } = setup({
      filesRead: vi.fn(async () => ({ content: 'big', truncated: true, byteLength: 9_000_000 }))
    })
    await flow.open('w', 'big.log')
    expect(open(flow.view())).toMatchObject({ status: 'ready', readOnly: 'truncated' })
  })

  it('treats the binary_file refusal as a read-only binary view, not an error', async () => {
    const { flow } = setup({
      filesRead: vi.fn(async () => {
        throw new Error('binary_file')
      })
    })
    await flow.open('w', 'logo.png')
    expect(open(flow.view())).toMatchObject({
      status: 'ready',
      readOnly: 'binary',
      content: '',
      error: null
    })
  })

  it('reports other read failures as an error state', async () => {
    const { flow } = setup({
      filesRead: vi.fn(async () => {
        throw new Error('ENOENT: no such file')
      })
    })
    await flow.open('w', 'gone.ts')
    expect(open(flow.view())).toMatchObject({ status: 'error', error: 'ENOENT: no such file' })
  })

  it('ignores a second open while a file is showing', async () => {
    const { flow, gateway } = setup()
    await flow.open('w', 'a.ts')
    await flow.open('w', 'b.ts')
    expect(gateway.filesRead).toHaveBeenCalledTimes(1)
    expect(open(flow.view()).path).toBe('a.ts')
  })

  it('does not apply a read that lands after the view was closed', async () => {
    const resolvers: Array<
      (value: { content: string; truncated: boolean; byteLength: number }) => void
    > = []
    const { flow } = setup({
      filesRead: vi.fn(
        () =>
          new Promise<{ content: string; truncated: boolean; byteLength: number }>((resolve) =>
            resolvers.push(resolve)
          )
      )
    })
    const pending = flow.open('w', 'a.ts')
    flow.requestClose()
    resolvers[0]!({ content: 'late', truncated: false, byteLength: 4 })
    await pending
    expect(flow.view()).toEqual({ phase: 'closed' })
  })
})

describe('file editor flow — close', () => {
  it('requestClose closes an open view and reports it handled', async () => {
    const { flow } = setup()
    await flow.open('w', 'a.ts')
    expect(flow.requestClose()).toBe(true)
    expect(flow.view()).toEqual({ phase: 'closed' })
    expect(flow.isOpen()).toBe(false)
  })

  it('requestClose is not handled when nothing is open', () => {
    const { flow } = setup()
    expect(flow.requestClose()).toBe(false)
  })
})
