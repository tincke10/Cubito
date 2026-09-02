import type { WorktreeNode } from '../../domain/worktree-graph/types'
import type { NodeDecorations, NodeState } from '../theme/node-state'

/** Semantic tone names only — the DOM writer maps these to CSS classes reading `cssVarsFor` custom properties. */
export type LabelTone = 'accent' | 'primary' | 'dim' | 'faint' | 'amber' | 'amberDim' | 'info'
export type LabelLine = { readonly text: string; readonly tone: LabelTone }
export type NodeLabelModel = {
  readonly primary: LabelLine
  readonly secondary: LabelLine | null
  readonly callout: { readonly title: LabelLine; readonly hint: LabelLine } | null
}

const MINUS = '−'
const REFS_HEADS_PREFIX = 'refs/heads/'

/** `refs/heads/feature-x` → `feature-x`; anything else passes through unchanged. */
const shortBranchName = (branch: string): string =>
  branch.startsWith(REFS_HEADS_PREFIX) ? branch.slice(REFS_HEADS_PREFIX.length) : branch

const diffText = (added: number, removed: number): string => `+${added} ${MINUS}${removed}`

/** The one dominant activity signal worth a second line; idle/archived/unread-with-no-diff have none. */
const secondaryFor = (node: WorktreeNode, state: NodeState, decorations: NodeDecorations): LabelLine | null => {
  if (state === 'working') {
    return { text: 'agente · trabajando', tone: 'info' }
  }
  if (state === 'waiting-input') {
    return { text: 'agente · esperando input', tone: 'amber' }
  }
  if (state === 'dirty' && decorations.diffLabel !== null) {
    return { text: diffText(decorations.diffLabel.added, decorations.diffLabel.removed), tone: 'dim' }
  }
  if (state === 'spawning' && node.activity.spawn !== null) {
    const percent = Math.round(node.activity.spawn.progress * 100)
    return { text: `${node.activity.spawn.phase} ${percent}%`, tone: 'info' }
  }
  return null
}

/**
 * Pure label content for a node (design §3, Decision 2 — DOM-projected `CSS2DObject` labels).
 * DOM projection lives in scene/node-label-element.ts; this module owns only content and tone.
 */
export function nodeLabelModel(node: WorktreeNode, state: NodeState, decorations: NodeDecorations): NodeLabelModel {
  return {
    primary: { text: shortBranchName(node.branch), tone: 'primary' },
    secondary: secondaryFor(node, state, decorations),
    callout:
      state === 'waiting-input'
        ? {
            title: { text: 'esperando input', tone: 'amber' },
            hint: { text: 'revisá el agente para continuar', tone: 'amberDim' }
          }
        : null
  }
}
