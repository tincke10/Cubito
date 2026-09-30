import { describe, expect, it } from 'vitest'
import { isMobileRpcMethodAllowed } from './runtime-rpc/cubito-mobile-rpc-methods'

// Why (Wave 5, C9; extended C-EXT for gates/inbox reads): the mobile allowlist only gates
// device.scope === 'mobile' — a 'runtime'-scope GUI lease caller already bypasses it. Adding
// these verbs is future-mobile + honest inventory; the real gate is the lease-ownership
// branch in each handler (see orchestration-run-scope.ts assertLeaseOwnership).
describe('mobile RPC allowlist: GUI run-lease verbs', () => {
  it.each([
    'orchestration.gateList',
    'orchestration.gateResolve',
    'orchestration.questionList',
    'orchestration.reply',
    'orchestration.runCreate',
    'orchestration.runShow',
    'orchestration.taskCreate',
    'orchestration.workerList',
    'orchestration.workerShow',
    'orchestration.workerStart'
  ])('allowlists %s', (method) => {
    expect(isMobileRpcMethodAllowed(method)).toBe(true)
  })
})
