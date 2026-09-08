/** Host capability gating the camada lease-run path (Change B); LOCAL mirror, not src/shared. */
export const GUI_RUN_LEASE_CAPABILITY = 'orchestration.gui-run-lease.v1'

/** Host capability gating gate/question visibility reads (Change C-EXTENDED); bundles
 *  the gateList lease-ownership fence + questionList. LOCAL mirror, not src/shared. */
export const GUI_RUN_LEASE_GATES_CAPABILITY = 'orchestration.gui-run-lease.gates.v1'

/** Host capability gating the winner-merge git.* RPC (Change E). LOCAL mirror, not src/shared. */
export const GIT_MERGE_WINNER_CAPABILITY = 'git.merge-winner.v1'

/** Host capability gating opt-in parent working-tree sync after a winner merge (v3-2). LOCAL
 *  mirror, not src/shared. */
export const GIT_MERGE_WINNER_SYNC_CAPABILITY = 'git.merge-winner.sync.v1'
