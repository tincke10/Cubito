import { createFileEditorFlow } from './application/file-editor-flow'
import type { FileEditorGatewayPort } from './application/file-editor-flow'
import { createFileQuickOpenFlow } from './application/file-quick-open-flow'
import type { FileQuickOpenGatewayPort } from './application/file-quick-open-flow'
import type { FileWorkspacePort } from './presentation/input/keyboard-controller'
import { createFileEditor } from './presentation/hud/file-editor-element'
import type { FileEditorHandle } from './presentation/hud/file-editor-element'
import { fileEditorPanelModel } from './presentation/hud/file-editor-view-model'
import { createFileQuickOpen } from './presentation/hud/file-quick-open-element'
import type { FileQuickOpenHandle } from './presentation/hud/file-quick-open-element'
import { fileQuickOpenPanelModel } from './presentation/hud/file-quick-open-view-model'

type FilesGateway = FileQuickOpenGatewayPort & FileEditorGatewayPort

export type FileWorkspaceBinder = FileWorkspacePort & {
  rebindGateway(gateway: FilesGateway): void
}

/** Extracted out of main.ts (max-lines ratchet): owns the quick-open picker and the file pane. */
export function createFileWorkspaceBinder(deps: {
  /** Always visible (diff/system modes hide the HUD), so the body in production. */
  slot: { appendChild(element: unknown): void }
  demoGateway: FilesGateway
  /** Diff/status refresh after a successful write. */
  onSaved(nodeId: string, path: string): void
  hostIdOf?(nodeId: string): string | undefined
  createQuickOpen?: () => FileQuickOpenHandle
  createEditor?: () => FileEditorHandle
}): FileWorkspaceBinder {
  let quickOpen: FileQuickOpenHandle | null = null
  let editor: FileEditorHandle | null = null

  /** Why: a two-step button blurs itself on confirm; the pane must keep keyboard focus. */
  const settle = (action: Promise<void>): Promise<void> => action.then(() => editor?.focusText())

  const editorFlow = createFileEditorFlow({
    gateway: deps.demoGateway,
    onSaved: deps.onSaved,
    ...(deps.hostIdOf ? { hostIdOf: deps.hostIdOf } : {})
  })
  const quickOpenFlow = createFileQuickOpenFlow({
    gateway: deps.demoGateway,
    onPick: (nodeId, path) => void editorFlow.open(nodeId, path)
  })

  quickOpenFlow.subscribe((view) => {
    if (view.phase === 'closed') {
      quickOpen?.dispose()
      quickOpen = null
      return
    }
    if (!quickOpen) {
      quickOpen = (deps.createQuickOpen ?? createFileQuickOpen)()
      quickOpen.onQueryChange((query) => quickOpenFlow.setQuery(query))
      quickOpen.onHighlight((delta) => quickOpenFlow.moveHighlight(delta))
      quickOpen.onActivate((index) => quickOpenFlow.activate(index ?? undefined))
      quickOpen.onClose(() => void quickOpenFlow.close())
      deps.slot.appendChild(quickOpen.root)
      quickOpen.focusQuery()
    }
    quickOpen.apply(fileQuickOpenPanelModel(view))
  })

  editorFlow.subscribe((view) => {
    if (view.phase === 'closed') {
      editor?.dispose()
      editor = null
      return
    }
    if (!editor) {
      editor = (deps.createEditor ?? createFileEditor)()
      editor.onClose(() => void editorFlow.requestClose())
      editor.onEdit((content) => editorFlow.edit(content))
      editor.onSave(() => void editorFlow.save())
      editor.onReload(() => void settle(editorFlow.resolveConflict('reload')))
      editor.onOverwrite(() => void settle(editorFlow.resolveConflict('overwrite')))
      editor.onDiscard(() => editorFlow.discard())
      editor.onKeepEditing(() => {
        editorFlow.keepEditing()
        editor?.focusText()
      })
      deps.slot.appendChild(editor.root)
      editor.focusText()
    }
    editor.apply(fileEditorPanelModel(view))
  })

  return {
    openPicker(nodeId) {
      if (editorFlow.isOpen() || quickOpenFlow.view().phase === 'open') return
      quickOpenFlow.open(nodeId)
    },
    openFile(nodeId, path) {
      if (editorFlow.isOpen()) return
      quickOpenFlow.close()
      void editorFlow.open(nodeId, path)
    },
    isOpen: () => editorFlow.isOpen() || quickOpenFlow.view().phase === 'open',
    requestClose: () => editorFlow.requestClose() || quickOpenFlow.close(),
    rebindGateway(gateway) {
      quickOpenFlow.rebindGateway(gateway)
      editorFlow.rebindGateway(gateway)
    }
  }
}
