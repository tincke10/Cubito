import type { enSystem } from '../en/system'

export const esSystem: Record<keyof typeof enSystem, string> = {
  'system.modeSuffix': 'sistema en vivo',
  'system.editing': 'claude editando',
  'system.counters': ' · {touched} · {created}',
  'system.touched.one': '{count} endpoint tocado',
  'system.touched.other': '{count} endpoints tocados',
  'system.created.one': '{count} nuevo',
  'system.created.other': '{count} nuevos',
  'system.feedTitle': 'actividad del agente',
  'system.feedTyping': 'escribiendo …',
  'system.feedEmpty': 'aún no hay actividad',
  'system.demoNote': 'creado por claude',
  'system.demoReadAuthRoute': 'leyó src/routes/auth.ts',
  'system.demoReadAuthService': 'leyó src/services/auth.service.ts',
  'system.demoEditing': 'editando POST /auth/retry',
  'system.demoNewEndpoint': 'nuevo endpoint POST /auth/refresh',
  'system.demoRan': 'corrió pnpm test auth.retry',
  'system.demoTestsPass': '✓ 8/8 tests verdes',
  'system.demoDiff': 'Δ +73 −14 contra main'
}
