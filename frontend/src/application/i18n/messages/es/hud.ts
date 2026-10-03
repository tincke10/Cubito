import type { enHud } from '../en/hud'

export const esHud: Record<keyof typeof enHud, string> = {
  'hud.connecting': 'conectando…',
  'hud.connected': 'conectado · runtime {runtimeId}',
  'hud.reconnecting': 'reconectando… · intento {attempt}',
  'hud.disconnected': 'desconectado · {reason}',
  'hud.noRepo': 'sin repositorio',
  'hud.repoLine': '{name} · {nodes}',
  'hud.nodes.one': '{count} nodo',
  'hud.nodes.other': '{count} nodos',
  'hud.activeAgents.one': '{count} agente activo',
  'hud.activeAgents.other': '{count} agentes activos',
  'hud.countersPrefix': '{nodes} · {agents} · ',
  'hud.countersWaiting': '{count} esperando input',
  'hud.fromParent': 'desde {branch}',
  'hud.fromRoot': 'desde raíz',
  'hud.agentWorking': 'agente · trabajando',
  'hud.agentWaiting': 'agente · esperando input',
  'hud.calloutWaiting': 'esperando input',
  'hud.calloutHint': 'revisá el agente para continuar'
}
