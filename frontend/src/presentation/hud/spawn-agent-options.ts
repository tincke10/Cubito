import { t } from '../../application/i18n/translate'
import type { SpawnAgent } from '../../application/ports/runtime-gateway'

export const AGENT_OPTIONS: readonly SpawnAgent[] = ['none', 'claude']

export const agentOptionLabel = (agent: SpawnAgent): string =>
  agent === 'none' ? t('spawn.agent.none') : t('spawn.agent.claude')
