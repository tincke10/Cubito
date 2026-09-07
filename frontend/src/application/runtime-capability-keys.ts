/** Host capability gating the camada lease-run path (Change B); LOCAL mirror, not src/shared. */
export const GUI_RUN_LEASE_CAPABILITY = 'orchestration.gui-run-lease.v1'

/** Host capability gating gate/question visibility reads (Change C-EXTENDED); bundles
 *  the gateList lease-ownership fence + questionList. LOCAL mirror, not src/shared. */
export const GUI_RUN_LEASE_GATES_CAPABILITY = 'orchestration.gui-run-lease.gates.v1'
