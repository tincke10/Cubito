import type { CompareMergeState } from '../../application/compare-view-model'

export type CompareMergeActionModel = {
  /** Hidden until a winner is picked — merge never implies picking one. */
  visible: boolean
  /** False when the host lacks `git.merge-winner.v1`. */
  capable: boolean
  /** v3-2: false when the host lacks `git.merge-winner.sync.v1` — gates the sync checkbox row. */
  syncCapable: boolean
  merge: CompareMergeState
}

export type CompareMergeActionHandle = {
  readonly root: HTMLElement
  apply(model: CompareMergeActionModel): void
  /** Fires on the 2nd click of the two-step arm — never on the 1st (arm-only). Receives the
   *  sync checkbox's current value (v3-2). */
  onMergeWinner(cb: (syncWorkingTree: boolean) => void): void
  dispose(): void
}

const IDLE_LABEL = 'mergear ganador'
const CONFIRM_LABEL = 'confirmar merge'
const RUNNING_LABEL = 'mergeando…'
const UNSUPPORTED_LABEL = 'no soportado'
const CONFLICT_HEADING = 'Conflicto — sin cambios aplicados:'
const SYNC_LABEL = 'sincronizar el padre'

/** R1: the merge is headless — it moves the parent branch ref but never touches the parent
 *  worktree's working tree, so the merged changes look uncommitted there until synced. */
const cleanText = (commitOid: string): string =>
  `Mergeado al padre (${commitOid.slice(0, 7)}). Sincronizá el worktree padre ` +
  '(reset/checkout) para ver los cambios.'

/** v3-2: per-status copy for the opt-in parent working-tree sync outcome. */
const workingTreeText = (
  workingTree: NonNullable<Extract<CompareMergeState, { phase: 'clean' }>['workingTree']>
): string => {
  if (workingTree.status === 'synced') return 'padre sincronizado.'
  if (workingTree.status === 'skipped') return 'padre no sincronizado: tiene cambios sin commitear.'
  return `padre no sincronizado: ${workingTree.message}`
}

/**
 * Compare mode's winner-merge action (Change E) — a real interactive `<button>` (the keyboard-bar
 * chips are inert, they can't host this). Two-step arm is EPHEMERAL, local to this element: 1st
 * click arms a confirm, 2nd fires `onMergeWinner`, Esc/blur/going-hidden disarms. Renders the
 * conflict file list or the R1-aware success copy from the last `apply()`'d merge state.
 */
export function createCompareMergeAction(doc: Document = document): CompareMergeActionHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-compare-merge-action'

  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'compare-merge-action__button'

  const syncRow = doc.createElement('label')
  syncRow.className = 'compare-merge-action__sync'
  const syncCheckbox = doc.createElement('input')
  syncCheckbox.type = 'checkbox'
  syncCheckbox.className = 'cubito-compare-merge__sync'
  const syncText = doc.createElement('span')
  syncText.textContent = SYNC_LABEL
  syncRow.appendChild(syncCheckbox)
  syncRow.appendChild(syncText)

  const result = doc.createElement('div')
  result.className = 'compare-merge-action__result'

  root.appendChild(button)
  root.appendChild(syncRow)
  root.appendChild(result)

  let armed = false
  let capable = false
  let running = false
  let mergeCallback: ((syncWorkingTree: boolean) => void) | null = null

  const renderLabel = (): void => {
    button.textContent = !capable
      ? UNSUPPORTED_LABEL
      : running
        ? RUNNING_LABEL
        : armed
          ? CONFIRM_LABEL
          : IDLE_LABEL
  }

  const disarm = (): void => {
    armed = false
    renderLabel()
  }

  const resetSyncCheckbox = (): void => {
    syncCheckbox.checked = false
  }

  button.addEventListener('click', () => {
    if (button.disabled) return
    if (!armed) {
      armed = true
      renderLabel()
      return
    }
    const syncWorkingTree = syncCheckbox.checked
    disarm()
    mergeCallback?.(syncWorkingTree)
  })
  button.addEventListener('blur', disarm)
  button.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') disarm()
  })

  const renderResult = (merge: CompareMergeState): void => {
    result.replaceChildren()
    if (merge.phase === 'clean') {
      const line = doc.createElement('div')
      line.className = 'compare-merge-action__result-line compare-merge-action__result-line--clean'
      line.textContent = merge.workingTree
        ? workingTreeText(merge.workingTree)
        : cleanText(merge.commitOid)
      result.appendChild(line)
    } else if (merge.phase === 'conflict') {
      const heading = doc.createElement('div')
      heading.className =
        'compare-merge-action__result-line compare-merge-action__result-line--conflict'
      heading.textContent = CONFLICT_HEADING
      result.appendChild(heading)
      const list = doc.createElement('ul')
      list.className = 'compare-merge-action__conflict-list'
      for (const file of merge.files) {
        const item = doc.createElement('li')
        item.textContent = file
        list.appendChild(item)
      }
      result.appendChild(list)
    } else if (merge.phase === 'error') {
      const line = doc.createElement('div')
      line.className = 'compare-merge-action__result-line compare-merge-action__result-line--error'
      line.textContent = merge.message
      result.appendChild(line)
    }
  }

  return {
    root,
    apply(model) {
      root.hidden = !model.visible
      if (!model.visible) {
        disarm()
        resetSyncCheckbox()
      }
      capable = model.capable
      running = model.merge.phase === 'running'
      button.disabled = !capable || running
      syncRow.hidden = !model.syncCapable
      renderLabel()
      renderResult(model.merge)
    },
    onMergeWinner(cb) {
      mergeCallback = cb
    },
    dispose() {
      root.remove()
    }
  }
}
