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

  it('treats text containing NUL as read-only binary (host only checks extensions; saving would corrupt it)', async () => {
    const { flow } = setup({
      filesRead: vi.fn(async () => ({
        content: 'PNG\u0000\u0000x',
        truncated: false,
        byteLength: 6
      }))
    })
    await flow.open('w', 'pic.dat')
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
    expect(open(flow.view())).toMatchObject({
      status: 'error',
      error: 'no se pudo abrir el archivo\u001fENOENT: no such file'
    })
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
    await vi.waitFor(() => expect(resolvers).toHaveLength(1))
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

const changed = (mtime: number, size = 5) => ({ size, mtime })

async function openReady(over: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(over)
  const onSaved = vi.fn()
  await ctx.flow.open('r::/w', 'src/a.ts')
  return { ...ctx, onSaved }
}

describe('file editor flow — edit and save', () => {
  it('tracks dirtiness against the last saved content', async () => {
    const { flow } = await openReady()
    expect(open(flow.view()).dirty).toBe(false)
    flow.edit('hello!')
    expect(open(flow.view())).toMatchObject({ content: 'hello!', dirty: true })
    flow.edit('hello')
    expect(open(flow.view()).dirty).toBe(false)
  })

  it('ignores edits on read-only views', async () => {
    const { flow } = await openReady({
      filesRead: vi.fn(async () => ({ content: 'big', truncated: true, byteLength: 9 }))
    })
    flow.edit('changed')
    expect(open(flow.view())).toMatchObject({ content: 'big', dirty: false })
  })

  it('passes the node host to the write so the host can verify where it lands', async () => {
    const gateway = {
      filesRead: vi.fn(async () => ({ content: 'hello', truncated: false, byteLength: 5 })),
      filesStat: vi.fn(async () => stamp),
      filesWrite: vi.fn(async () => undefined)
    }
    const flow = createFileEditorFlow({ gateway, onSaved: vi.fn(), hostIdOf: () => 'local' })
    await flow.open('r::/w', 'src/a.ts')
    flow.edit('hello world')
    await flow.save()
    expect(gateway.filesWrite).toHaveBeenCalledWith('r::/w', 'src/a.ts', 'hello world', 'local')
  })

  it('re-stats before writing, then writes the whole content and clears dirty', async () => {
    const { flow, gateway } = await openReady()
    flow.edit('hello world')
    await flow.save()
    expect(gateway.filesStat).toHaveBeenCalledTimes(3)
    expect(gateway.filesWrite).toHaveBeenCalledWith('r::/w', 'src/a.ts', 'hello world')
    expect(open(flow.view())).toMatchObject({
      dirty: false,
      saving: false,
      notice: 'guardado',
      conflict: null,
      error: null
    })
  })

  it('reports the saved file so diff and status can refresh', async () => {
    const gateway = {
      filesRead: vi.fn(async () => ({ content: 'a', truncated: false, byteLength: 1 })),
      filesStat: vi.fn(async () => stamp),
      filesWrite: vi.fn(async () => undefined)
    }
    const onSaved = vi.fn()
    const flow = createFileEditorFlow({ gateway, onSaved })
    await flow.open('r::/w', 'src/a.ts')
    flow.edit('b')
    await flow.save()
    expect(onSaved).toHaveBeenCalledWith('r::/w', 'src/a.ts')
  })

  it('does nothing when there is nothing to save', async () => {
    const { flow, gateway } = await openReady()
    await flow.save()
    expect(gateway.filesWrite).not.toHaveBeenCalled()
  })

  it('keeps the edits and shows the error when the write fails', async () => {
    const { flow } = await openReady({
      filesWrite: vi.fn(async () => {
        throw new Error('EACCES')
      })
    })
    flow.edit('x')
    await flow.save()
    expect(open(flow.view())).toMatchObject({
      dirty: true,
      saving: false,
      error: 'no se pudo guardar el archivo\u001fEACCES'
    })
  })

  it('stays dirty when typing continued during the write', async () => {
    const finishers: Array<() => void> = []
    const { flow } = await openReady({
      filesWrite: vi.fn(() => new Promise<void>((resolve) => finishers.push(resolve)))
    })
    flow.edit('one')
    const saving = flow.save()
    await Promise.resolve()
    await Promise.resolve()
    flow.edit('one two')
    finishers[0]!()
    await saving
    expect(open(flow.view())).toMatchObject({ content: 'one two', dirty: true, saving: false })
  })
})

describe('file editor flow — conflict check', () => {
  it('blocks the write when the file changed on disk since it was opened', async () => {
    const stats = [stamp, changed(200)]
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => stats.shift() ?? changed(200))
    })
    flow.edit('mine')
    await flow.save()
    expect(gateway.filesWrite).not.toHaveBeenCalled()
    expect(open(flow.view())).toMatchObject({ conflict: { reason: 'changed' }, dirty: true })
  })

  it('treats a size change with the same mtime as a conflict', async () => {
    const stats = [stamp, changed(100, 9)]
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => stats.shift() ?? stamp)
    })
    flow.edit('mine')
    await flow.save()
    expect(gateway.filesWrite).not.toHaveBeenCalled()
  })

  it('flags a failed re-stat as unverifiable instead of writing blindly', async () => {
    let calls = 0
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => {
        calls += 1
        if (calls > 1) throw new Error('gone')
        return stamp
      })
    })
    flow.edit('mine')
    await flow.save()
    expect(gateway.filesWrite).not.toHaveBeenCalled()
    expect(open(flow.view()).conflict).toEqual({ reason: 'unverifiable' })
  })

  it('does not save again while a conflict is pending', async () => {
    const stats = [stamp, changed(200)]
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => stats.shift() ?? changed(200))
    })
    flow.edit('mine')
    await flow.save()
    await flow.save()
    expect(gateway.filesStat).toHaveBeenCalledTimes(2)
    expect(gateway.filesWrite).not.toHaveBeenCalled()
  })

  it('overwrite writes without the check and clears the conflict', async () => {
    const stats = [stamp, changed(200)]
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => stats.shift() ?? changed(300))
    })
    flow.edit('mine')
    await flow.save()
    await flow.resolveConflict('overwrite')
    expect(gateway.filesWrite).toHaveBeenCalledWith('r::/w', 'src/a.ts', 'mine')
    expect(open(flow.view())).toMatchObject({ conflict: null, dirty: false })
  })

  it('reload replaces the edits with the file on disk', async () => {
    const stats = [stamp, changed(200)]
    const reads = [
      { content: 'hello', truncated: false, byteLength: 5 },
      { content: 'theirs', truncated: false, byteLength: 6 }
    ]
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => stats.shift() ?? changed(200, 6)),
      filesRead: vi.fn(async () => reads.shift() ?? reads[0]!)
    })
    flow.edit('mine')
    await flow.save()
    await flow.resolveConflict('reload')
    expect(gateway.filesWrite).not.toHaveBeenCalled()
    expect(open(flow.view())).toMatchObject({ content: 'theirs', dirty: false, conflict: null })
  })

  it('after a save the next save compares against the new stamp', async () => {
    const stats = [stamp, stamp, changed(150, 6), changed(150, 6)]
    const { flow, gateway } = await openReady({
      filesStat: vi.fn(async () => stats.shift() ?? changed(150, 6))
    })
    flow.edit('mine')
    await flow.save()
    flow.edit('mine again')
    await flow.save()
    expect(gateway.filesWrite).toHaveBeenCalledTimes(2)
  })
})

describe('file editor flow — closing with unsaved changes', () => {
  it('asks before discarding, then closes on discard', async () => {
    const { flow } = await openReady()
    flow.edit('dirty')
    expect(flow.requestClose()).toBe(true)
    expect(open(flow.view()).confirmDiscard).toBe(true)
    flow.discard()
    expect(flow.view()).toEqual({ phase: 'closed' })
  })

  it('Esc again, or keepEditing, goes back to editing', async () => {
    const { flow } = await openReady()
    flow.edit('dirty')
    flow.requestClose()
    expect(flow.requestClose()).toBe(true)
    expect(open(flow.view())).toMatchObject({ confirmDiscard: false, content: 'dirty' })
    flow.requestClose()
    flow.keepEditing()
    expect(open(flow.view()).confirmDiscard).toBe(false)
  })

  it('closes straight away when clean, and refuses to close mid-save', async () => {
    const finishers: Array<() => void> = []
    const { flow } = await openReady({
      filesWrite: vi.fn(() => new Promise<void>((resolve) => finishers.push(resolve)))
    })
    flow.edit('x')
    const saving = flow.save()
    await Promise.resolve()
    await Promise.resolve()
    expect(flow.requestClose()).toBe(true)
    expect(flow.isOpen()).toBe(true)
    finishers[0]!()
    await saving
    expect(flow.requestClose()).toBe(true)
    expect(flow.isOpen()).toBe(false)
  })
})
