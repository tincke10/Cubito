import type { enHud } from '../en/hud'

export const esHud: Record<keyof typeof enHud, string> = {
  'hud.connecting': 'conectando…',
  'hud.connected': 'conectado · runtime {runtimeId}',
  'hud.reconnecting': 'reconectando… · intento {attempt}',
  'hud.disconnected': 'desconectado · {reason}',
  'hud.noRepo': 'sin repositorio',
  'hud.repoLine': '{name} · {count} nodos',
  'hud.countersPrefix': '{total} nodos · {working} agentes activos · ',
  'hud.countersWaiting': '{count} esperando input',
  'hud.fromParent': 'desde {branch}',
  'hud.fromRoot': 'desde raíz',
  'hud.agentWorking': 'agente · trabajando',
  'hud.agentWaiting': 'agente · esperando input',
  'hud.calloutWaiting': 'esperando input',
  'hud.calloutHint': 'revisá el agente para continuar'
}
