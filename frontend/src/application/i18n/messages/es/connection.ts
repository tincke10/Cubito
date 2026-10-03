import type { enConnection } from '../en/connection'

export const esConnection: Record<keyof typeof enConnection, string> = {
  'connection.invalidPairing': 'código de pairing inválido',
  'connection.unsupportedVersion': 'versión de pairing no soportada',
  'connection.relayUnsupported': 'pairing por relay no soportado',
  'connection.tokenRejected': 'orcad rechazó el token',
  'connection.unresponsive': 'orcad no responde',
  'connection.invalidResponse': 'respuesta inválida de orcad',
  'connection.notConnected': 'sin conexión',
  'connection.demoMode': 'modo demo',
  'connection.demoBanner':
    'MODO DEMO — datos de ejemplo, sin conexión a orcad ({reason}). Abrí la URL de pairing para conectar.'
}
