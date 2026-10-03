import type { enCompare } from '../en/compare'

export const esCompare: Record<keyof typeof enCompare, string> = {
  'compare.hudMode': 'comparar la camada',
  'compare.noWinner': 'sin elegir',
  'compare.hudWinner': '{count} hijos · ganador: {winner}',
  'compare.merge': 'mergear ganador',
  'compare.mergeConfirm': 'confirmar merge',
  'compare.merging': 'mergeando…',
  'compare.mergeUnsupported': 'no soportado',
  'compare.conflict': 'Conflicto — sin cambios aplicados:',
  'compare.syncParent': 'sincronizar el padre',
  'compare.mergedClean':
    'Mergeado al padre ({oid}). Sincronizá el worktree padre (reset/checkout) para ver los cambios.',
  'compare.parentSynced': 'padre sincronizado.',
  'compare.parentSkipped': 'padre no sincronizado: tiene cambios sin commitear.',
  'compare.parentSyncFailed': 'padre no sincronizado: {message}',
  'compare.reinstalling': 'reinstalando dependencias del padre en segundo plano (setup).',
  'compare.winner': 'ganador',
  'compare.pickWinner': 'elegir ganador',
  'compare.railStats': '{files} archivos · +{added} −{removed}',
  'compare.railEmpty': 'sin litter'
}
