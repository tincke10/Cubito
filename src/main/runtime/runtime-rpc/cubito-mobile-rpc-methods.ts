import { MOBILE_RPC_METHOD_ALLOWLIST } from './runtime-rpc-mobile-method-allowlist'

// Why a separate list: the fork's own paired-client verbs stay out of the upstream-owned file.
export const CUBITO_MOBILE_RPC_METHODS = [
  'git.mergeWinnerIntoParent',
  // Why: future-mobile + honest inventory only — a mobile-scope caller still has no
  // paired-device lease predicate match (that requires clientKind 'runtime'), so the
  // real gate for these verbs is the lease-ownership branch, not this allowlist.
  'orchestration.gateList',
  'orchestration.gateResolve',
  'orchestration.questionList',
  'orchestration.reply',
  'orchestration.runCreate',
  'orchestration.runShow',
  'orchestration.taskCreate',
  'orchestration.workerList',
  'orchestration.workerShow',
  'orchestration.workerStart',
  'system.snapshot',
  'system.unwatch',
  'system.watch',
  'agent.activity'
] as const

const CUBITO_MOBILE_RPC_METHOD_SET: ReadonlySet<string> = new Set(CUBITO_MOBILE_RPC_METHODS)

/** Whether a mobile-scope device may call `method`: upstream's allowlist plus the fork's verbs. */
export function isMobileRpcMethodAllowed(method: string): boolean {
  return MOBILE_RPC_METHOD_ALLOWLIST.has(method) || CUBITO_MOBILE_RPC_METHOD_SET.has(method)
}
