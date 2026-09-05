import { buildSystemGraph } from './domain/system-graph/build-system-graph'
import type { SystemGraphPort } from './application/ports/system-graph-port'

// Sistema en vivo (design: VistaSistema.dc.html) demo stub — a fixed router->endpoint->service->db
// chain whose ids match SYSTEM_ARC's beats ('router', 'POST /auth/retry') so the scripted arc
// (edits/creates/tests the endpoint) engages against real graph nodes. Extracted out of main.ts
// (max-lines ratchet), mirrors main.ts's own inline `demoRecords` in spirit.
export const demoSystemGraph: SystemGraphPort = {
  loadSystemGraph: async () =>
    buildSystemGraph({
      nodes: [
        { id: 'router', kind: 'router', label: 'router', state: 'idle', diff: null },
        {
          id: 'POST /auth/retry',
          kind: 'endpoint',
          label: 'POST /auth/retry',
          method: 'POST',
          state: 'idle',
          diff: null
        },
        { id: 'auth.service', kind: 'service', label: 'auth.service', state: 'idle', diff: null },
        { id: 'database', kind: 'database', label: 'database', state: 'idle', diff: null }
      ],
      edges: [
        { from: 'router', to: 'POST /auth/retry', kind: 'normal' },
        { from: 'POST /auth/retry', to: 'auth.service', kind: 'normal' },
        { from: 'auth.service', to: 'database', kind: 'normal' }
      ]
    })
}
