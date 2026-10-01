import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileWorkspaceBinder } from './bind-file-workspace'
import type { FileQuickOpenHandle } from './presentation/hud/file-quick-open-element'
import type { FileQuickOpenPanelModel } from './presentation/hud/file-quick-open-view-model'
import type { FileEditorHandle } from './presentation/hud/file-editor-element'
import type { FileEditorPanelModel } from './presentation/hud/file-editor-view-model'

function setup() {
  const quickModels: FileQuickOpenPanelModel[] = []
  const editorModels: FileEditorPanelModel[] = []
  const quick = {
    callbacks: {
      query: (_q: string) => undefined as void,
      highlight: (_d: number) => undefined as void,
      activate: (_i: number | null) => undefined as void,
      close: () => undefined as void
    },
    dispose: vi.fn(),
    focusQuery: vi.fn()
  }
  const editor = {
    callbacks: {
      close: () => undefined as void,
      edit: (_c: string) => undefined as void,
      save: () => undefined as void,
      reload: () => undefined as void,
      overwrite: () => undefined as void,
      discard: () => undefined as void,
      keepEditing: () => undefined as void
    },
    dispose: vi.fn(),
    focusText: vi.fn()
  }
  const quickHandle: FileQuickOpenHandle = {
    root: {} as HTMLElement,
    apply: (model) => quickModels.push(model),
    onQueryChange: (cb) => (quick.callbacks.query = cb),
    onHighlight: (cb) => (quick.callbacks.highlight = cb),
    onActivate: (cb) => (quick.callbacks.activate = cb),
    onClose: (cb) => (quick.callbacks.close = cb),
    focusQuery: quick.focusQuery,
    dispose: quick.dispose
  }
  const editorHandle: FileEditorHandle = {
    root: {} as HTMLElement,
    apply: (model) => editorModels.push(model),
    onEdit: (cb) => (editor.callbacks.edit = cb),
    onSave: (cb) => (editor.callbacks.save = cb),
    onClose: (cb) => (editor.callbacks.close = cb),
    onReload: (cb) => (editor.callbacks.reload = cb),
    onOverwrite: (cb) => (editor.callbacks.overwrite = cb),
    onDiscard: (cb) => (editor.callbacks.discard = cb),
    onKeepEditing: (cb) => (editor.callbacks.keepEditing = cb),
    focusText: editor.focusText,
    dispose: editor.dispose
  }
  const gateway = {
    filesSearchPaths: vi.fn(async () => ({
      files: [{ relativePath: 'src/a.ts', basename: 'a.ts', binary: false }],
      truncated: false
    })),
    filesRead: vi.fn(async () => ({ content: 'hello', truncated: false, byteLength: 5 })),
    filesStat: vi.fn(async () => ({ size: 5, mtime: 1 })),
    filesWrite: vi.fn(async () => undefined)
  }
  const slot = { appendChild: vi.fn() }
  const onSaved = vi.fn()
  const binder = createFileWorkspaceBinder({
    slot,
    demoGateway: gateway,
    onSaved,
    createQuickOpen: () => quickHandle,
    createEditor: () => editorHandle
  })
  return { binder, gateway, slot, quick, editor, quickModels, editorModels, onSaved }
}

describe('file workspace binder', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('mounts the picker focused and unmounts it on close', () => {
    const { binder, slot, quick, quickModels } = setup()
    expect(binder.isOpen()).toBe(false)
    binder.openPicker('r::/w')
    expect(binder.isOpen()).toBe(true)
    expect(slot.appendChild).toHaveBeenCalledTimes(1)
    expect(quick.focusQuery).toHaveBeenCalled()
    expect(quickModels.at(-1)?.visible).toBe(true)
    expect(binder.requestClose()).toBe(true)
    expect(quick.dispose).toHaveBeenCalled()
    expect(binder.isOpen()).toBe(false)
    expect(binder.requestClose()).toBe(false)
  })

  it('searches the selected node and opens the picked file in the view', async () => {
    const { binder, gateway, quick, editor, editorModels, quickModels } = setup()
    binder.openPicker('r::/w')
    quick.callbacks.query('a')
    await vi.advanceTimersByTimeAsync(200)
    expect(gateway.filesSearchPaths).toHaveBeenCalledWith('r::/w', 'a', 20)
    expect(quickModels.at(-1)?.rows).toHaveLength(1)
    quick.callbacks.activate(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(quick.dispose).toHaveBeenCalled()
    expect(gateway.filesRead).toHaveBeenCalledWith('r::/w', 'src/a.ts')
    expect(editor.focusText).toHaveBeenCalled()
    expect(editorModels.at(-1)).toMatchObject({ title: 'src/a.ts', text: 'hello' })
  })

  it('opens a file directly (diff rail) and closes it through requestClose', async () => {
    const { binder, editor, editorModels } = setup()
    binder.openFile('r::/w', 'x.ts')
    await vi.advanceTimersByTimeAsync(0)
    expect(binder.isOpen()).toBe(true)
    expect(editorModels.at(-1)?.visible).toBe(true)
    editor.callbacks.close()
    expect(editor.dispose).toHaveBeenCalled()
    expect(binder.isOpen()).toBe(false)
  })

  it('does not open a second picker over an open file', async () => {
    const { binder, slot } = setup()
    binder.openFile('w', 'x.ts')
    await vi.advanceTimersByTimeAsync(0)
    binder.openPicker('w')
    expect(slot.appendChild).toHaveBeenCalledTimes(1)
  })

  it('rebinding swaps the gateway used by later reads', async () => {
    const { binder, gateway } = setup()
    const next = {
      filesSearchPaths: vi.fn(),
      filesRead: vi.fn(async () => ({ content: 'new', truncated: false, byteLength: 3 })),
      filesStat: vi.fn(async () => ({ size: 3, mtime: 2 })),
      filesWrite: vi.fn()
    }
    binder.rebindGateway(next as never)
    binder.openFile('w', 'x.ts')
    await vi.advanceTimersByTimeAsync(0)
    expect(next.filesRead).toHaveBeenCalled()
    expect(gateway.filesRead).not.toHaveBeenCalled()
  })

  it('edits and saves through the flow, reporting the saved file', async () => {
    const { binder, gateway, editor, editorModels, onSaved } = setup()
    binder.openFile('r::/w', 'x.ts')
    await vi.advanceTimersByTimeAsync(0)
    editor.callbacks.edit('changed')
    expect(editorModels.at(-1)).toMatchObject({ dirty: true, saveEnabled: true })
    editor.callbacks.save()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.filesWrite).toHaveBeenCalledWith('r::/w', 'x.ts', 'changed')
    expect(onSaved).toHaveBeenCalledWith('r::/w', 'x.ts')
    expect(editorModels.at(-1)).toMatchObject({ dirty: false, notice: 'guardado' })
  })

  it('asks before discarding edits: close prompts, keepEditing backs out, discard closes', async () => {
    const { binder, editor, editorModels } = setup()
    binder.openFile('w', 'x.ts')
    await vi.advanceTimersByTimeAsync(0)
    editor.callbacks.edit('changed')
    expect(binder.requestClose()).toBe(true)
    expect(editorModels.at(-1)?.discard).not.toBeNull()
    expect(binder.isOpen()).toBe(true)
    editor.callbacks.keepEditing()
    expect(editorModels.at(-1)?.discard).toBeNull()
    binder.requestClose()
    editor.callbacks.discard()
    expect(binder.isOpen()).toBe(false)
  })

  it('a changed file blocks the save until overwrite is confirmed', async () => {
    const { binder, gateway, editor, editorModels } = setup()
    binder.openFile('w', 'x.ts')
    await vi.advanceTimersByTimeAsync(0)
    gateway.filesStat.mockResolvedValue({ size: 9, mtime: 99 })
    editor.callbacks.edit('mine')
    editor.callbacks.save()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.filesWrite).not.toHaveBeenCalled()
    expect(editorModels.at(-1)?.conflict).not.toBeNull()
    editor.callbacks.overwrite()
    await vi.advanceTimersByTimeAsync(0)
    expect(gateway.filesWrite).toHaveBeenCalledWith('w', 'x.ts', 'mine')
  })
})
