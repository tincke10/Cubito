// Why: signals the host accepts paired-GUI Run leases (runCreate/taskCreate/workerStart
// with no coordinator terminal). Registered unconditionally, like aiVault.v1, so a client
// can probe for it and safe-fail to the terminal-pane flow against an older host.
export const GUI_RUN_LEASE_RUNTIME_CAPABILITY = 'orchestration.gui-run-lease.v1' as const
// Why: signals the host lease-scopes gateList reads and exposes questionList, so a paired
// GUI can safely poll a Run's decision gates and inbox. Registered unconditionally, like
// gui-run-lease.v1, so an older host without it is never probed for questionList.
export const GUI_RUN_LEASE_GATES_RUNTIME_CAPABILITY =
  'orchestration.gui-run-lease.gates.v1' as const
// Why: statically advertised when host CODE has the method; a per-host git<2.38
// floor fails at call time as a merge-error, not at capability negotiation.
export const GIT_MERGE_WINNER_RUNTIME_CAPABILITY = 'git.merge-winner.v1' as const
// Why: no version floor unlike merge-tree in git.merge-winner.v1 — read-tree predates the repo's git baseline.
export const GIT_MERGE_WINNER_SYNC_RUNTIME_CAPABILITY = 'git.merge-winner.sync.v1' as const

// Why a separate module: the fork's capabilities stay out of the upstream-owned protocol file.
export const CUBITO_RUNTIME_CAPABILITIES = [
  GUI_RUN_LEASE_RUNTIME_CAPABILITY,
  GUI_RUN_LEASE_GATES_RUNTIME_CAPABILITY,
  GIT_MERGE_WINNER_RUNTIME_CAPABILITY,
  GIT_MERGE_WINNER_SYNC_RUNTIME_CAPABILITY
] as const
