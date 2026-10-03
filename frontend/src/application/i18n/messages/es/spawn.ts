import type { enSpawn } from '../en/spawn'

export const esSpawn: Record<keyof typeof enSpawn, string> = {
  'spawn.radial.child': 'spawn hijo',
  'spawn.radial.fanOut': 'fan-out',
  'spawn.radial.terminal': 'terminal',
  'spawn.radial.archive': 'archivar',
  'spawn.agent.none': 'ninguno',
  'spawn.agent.claude': 'claude',
  'spawn.title': 'spawn hijo · {from}',
  'spawn.submit': 'crear worktree',
  'spawn.submitting': 'creando…',
  'spawn.cancel': 'cancelar',
  'spawn.hint': '⏎ crear · esc cancelar',
  'spawn.repoUnresolved': 'repositorio aún no resuelto',
  'spawn.noSetupHint': 'sin setup: el worktree nace sin dependencias (configuralo en ⌘P)'
}
