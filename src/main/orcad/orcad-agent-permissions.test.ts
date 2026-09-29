import { describe, expect, it } from 'vitest'
import { buildAgentPermissionsPatch } from './orcad-agent-permissions'

describe('buildAgentPermissionsPatch', () => {
  it('manual turns yolo args into empty strings and marks the migration done', () => {
    const patch = buildAgentPermissionsPatch('manual', {
      agentDefaultArgs: {
        claude: '--dangerously-skip-permissions',
        codex: '--dangerously-bypass-approvals-and-sandbox'
      }
    })
    expect(patch.agentDefaultArgs.claude).toBe('')
    expect(patch.agentDefaultArgs.codex).toBe('')
    expect(patch.agentYoloDefaultsMigrated).toBe(true)
  })

  it('yolo restores the bypass args', () => {
    const patch = buildAgentPermissionsPatch('yolo', { agentDefaultArgs: { claude: '' } })
    expect(patch.agentDefaultArgs.claude).toBe('--dangerously-skip-permissions')
  })

  it('preserves a user-customized arg in both modes', () => {
    for (const mode of ['manual', 'yolo'] as const) {
      const patch = buildAgentPermissionsPatch(mode, {
        agentDefaultArgs: { claude: '--model opus' }
      })
      expect(patch.agentDefaultArgs.claude).toBe('--model opus')
    }
  })

  it('flips env-based agents too', () => {
    expect(buildAgentPermissionsPatch('yolo', {}).agentDefaultEnv.goose).toEqual({
      GOOSE_MODE: 'auto'
    })
    expect(
      buildAgentPermissionsPatch('manual', {
        agentDefaultEnv: { goose: { GOOSE_MODE: 'auto' } }
      }).agentDefaultEnv.goose
    ).toEqual({})
  })
})
