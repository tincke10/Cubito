import type { SpawnMenuSlice } from '../../application/spawn-menu-model'
import type { SpawnAgent } from '../../application/ports/runtime-gateway'
import type { WorktreeGraph } from '../../domain/worktree-graph/types'
import { shortBranchName } from './node-label-model'

export type SpawnChipTone = 'active' | 'disabled'
export type SpawnChip = {
  readonly key: string
  readonly label: string
  readonly tone: SpawnChipTone
}

/** SPAWN-002: only "spawn hijo" is in scope — fan-out/terminal/archivar render inert. */
const RADIAL_CHIPS: readonly SpawnChip[] = [
  { key: 's', label: 'spawn hijo', tone: 'active' },
  { key: 'F', label: 'fan-out', tone: 'disabled' },
  { key: 't', label: 'terminal', tone: 'disabled' },
  { key: 'a', label: 'archivar', tone: 'disabled' }
]

export type SpawnRadialViewModel = { readonly view: 'radial'; readonly chips: readonly SpawnChip[] }

export type SpawnFieldViewModel = { readonly value: string; readonly enabled: boolean }

export type SpawnFormViewModel = {
  readonly view: 'form'
  readonly title: string
  readonly name: SpawnFieldViewModel
  readonly agent: { readonly value: SpawnAgent; readonly enabled: boolean }
  readonly baseBranch: SpawnFieldViewModel
  readonly prompt: SpawnFieldViewModel
  readonly submitLabel: string
  readonly submitEnabled: boolean
  readonly errorMessage: string | null
}

export type SpawnViewModel = SpawnRadialViewModel | SpawnFormViewModel | null

const formTitle = (parentBranch: string | null): string =>
  parentBranch !== null
    ? `spawn hijo · desde ${shortBranchName(parentBranch)}`
    : 'spawn hijo · desde raíz'

/**
 * Pure render model for the spawn radial/form (SPAWN-002/003/004). DOM projection lives in
 * spawn-menu-element.ts/spawn-form-element.ts; this owns only content, tone and enablement.
 */
export function spawnViewModel(slice: SpawnMenuSlice, graph: WorktreeGraph): SpawnViewModel {
  if (slice.view === 'closed') return null
  if (slice.view === 'radial') return { view: 'radial', chips: RADIAL_CHIPS }

  const submitting = slice.status === 'submitting'
  const parentBranch =
    slice.parentId !== null ? (graph.nodes.get(slice.parentId)?.branch ?? null) : null
  const agentActive = slice.fields.agent !== 'none'

  return {
    view: 'form',
    title: formTitle(parentBranch),
    name: { value: slice.fields.name, enabled: !submitting },
    agent: { value: slice.fields.agent, enabled: !submitting },
    baseBranch: { value: slice.fields.baseBranch, enabled: !submitting },
    prompt: { value: slice.fields.prompt, enabled: agentActive && !submitting },
    submitLabel: submitting ? 'creando…' : 'crear worktree',
    submitEnabled: slice.fields.name.trim() !== '' && !submitting,
    errorMessage: slice.status === 'error' ? (slice.errorMessage ?? 'error') : null
  }
}
