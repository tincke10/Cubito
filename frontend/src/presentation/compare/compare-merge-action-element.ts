import type { CompareMergeState } from '../../application/compare-view-model'
import { createTwoStepButton } from '../hud/two-step-button'
import { t } from '../../application/i18n/translate'

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

/** R1: the merge is headless — it moves the parent branch ref but never touches the parent
 *  worktree's working tree, so the merged changes look uncommitted there until synced. */
const cleanText = (commitOid: string): string =>
  t('compare.mergedClean', { oid: commitOid.slice(0, 7) })

/** v3-2: per-status copy for the opt-in parent working-tree sync outcome. */
const workingTreeText = (
  workingTree: NonNullable<Extract<CompareMergeState, { phase: 'clean' }>['workingTree']>
): string => {
  if (workingTree.status === 'synced') return t('compare.parentSynced')
  if (workingTree.status === 'skipped') return t('compare.parentSkipped')
  return t('compare.parentSyncFailed', { message: workingTree.message })
}

/** Copy for the background parent setup-hook re-run triggered by changed package manifests. */
const dependencySetupText = (
  _setup: NonNullable<Extract<CompareMergeState, { phase: 'clean' }>['dependencySetup']>
): string => t('compare.reinstalling')

/**
 * Compare mode's winner-merge action (Change E) — a real interactive `<button>` (the keyboard-bar
 * chips are inert, they can't host this). Two-step arm is EPHEMERAL, local to this element: 1st
 * click arms a confirm, 2nd fires `onMergeWinner`, Esc/blur/going-hidden disarms. Renders the
 * conflict file list or the R1-aware success copy from the last `apply()`'d merge state.
 */
export function createCompareMergeAction(doc: Document = document): CompareMergeActionHandle {
  const root = doc.createElement('div')
  root.className = 'cubito-compare-merge-action'

  const twoStep = createTwoStepButton(doc, 'compare-merge-action__button')
  const button = twoStep.element

  const syncRow = doc.createElement('label')
  syncRow.className = 'compare-merge-action__sync'
  const syncCheckbox = doc.createElement('input')
  syncCheckbox.type = 'checkbox'
  syncCheckbox.className = 'cubito-compare-merge__sync'
  const syncText = doc.createElement('span')
  syncText.textContent = t('compare.syncParent')
  syncRow.appendChild(syncCheckbox)
  syncRow.appendChild(syncText)

  const result = doc.createElement('div')
  result.className = 'compare-merge-action__result'

  root.appendChild(button)
  root.appendChild(syncRow)
  root.appendChild(result)

  let capable = false
  let mergeCallback: ((syncWorkingTree: boolean) => void) | null = null

  const resetSyncCheckbox = (): void => {
    syncCheckbox.checked = false
  }

  twoStep.onConfirm(() => mergeCallback?.(syncCheckbox.checked))

  const renderResult = (merge: CompareMergeState): void => {
    result.replaceChildren()
    if (merge.phase === 'clean') {
      const line = doc.createElement('div')
      line.className = 'compare-merge-action__result-line compare-merge-action__result-line--clean'
      line.textContent = merge.workingTree
        ? workingTreeText(merge.workingTree)
        : cleanText(merge.commitOid)
      result.appendChild(line)
      if (merge.dependencySetup) {
        const setupLine = doc.createElement('div')
        setupLine.className =
          'compare-merge-action__result-line compare-merge-action__result-line--clean'
        setupLine.textContent = dependencySetupText(merge.dependencySetup)
        result.appendChild(setupLine)
      }
    } else if (merge.phase === 'conflict') {
      const heading = doc.createElement('div')
      heading.className =
        'compare-merge-action__result-line compare-merge-action__result-line--conflict'
      heading.textContent = t('compare.conflict')
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
        twoStep.disarm()
        resetSyncCheckbox()
      }
      capable = model.capable
      twoStep.apply({
        labels: {
          idle: capable ? t('compare.merge') : t('compare.mergeUnsupported'),
          confirm: capable ? t('compare.mergeConfirm') : t('compare.mergeUnsupported'),
          busy: t('compare.merging')
        },
        busy: model.merge.phase === 'running',
        disabled: !capable
      })
      syncRow.hidden = !model.syncCapable
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
