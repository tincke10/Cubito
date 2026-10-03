import type { enFanout } from '../en/fanout'

export const esFanout: Record<keyof typeof enFanout, string> = {
  'fanout.title': 'fan-out · {parent}',
  'fanout.titleBare': 'fan-out',
  'fanout.callout': 'fan-out · {count} × {agent}',
  'fanout.submit': 'lanzar camada',
  'fanout.cancel': 'cancelar',
  'fanout.counters':
    '{working} trabajando · {waiting} esperando · {spawning} naciendo · {ready} listo · {gates} compuertas · {questions} preguntas',
  'fanout.countersFailedTail': '{count} error',
  'fanout.countRange': 'la camada tiene entre {min} y {max} cubos',
  'fanout.promptRequired': 'escribí qué tiene que hacer la camada',
  'fanout.repoUnresolved': 'repositorio aún no resuelto',
  'fanout.childFailureFallback': 'no se pudo crear el cubo',
  'fanout.gateResolve': 'resolver',
  'fanout.questionAnswer': 'responder',
  'fanout.rowSubmitFailed': 'no se pudo enviar'
}
