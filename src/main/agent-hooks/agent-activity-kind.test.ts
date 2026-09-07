import { describe, expect, it } from 'vitest'
import { classifyAgentTool, relativizeToWorktree } from './agent-activity-kind'

describe('classifyAgentTool', () => {
  it.each([
    ['Read', 'read'],
    ['read_file', 'read'],
    ['view_file', 'read'],
    ['Edit', 'edit'],
    ['search_replace', 'edit'],
    ['replace_file_content', 'edit'],
    ['Write', 'create'],
    ['write_to_file', 'create'],
    ['Bash', 'run'],
    ['run_shell_command', 'run'],
    ['run_terminal_command', 'run']
  ] as const)('classifies %s as %s', (toolName, kind) => {
    expect(classifyAgentTool(toolName)).toBe(kind)
  })

  it('maps Write to create and Edit to edit explicitly', () => {
    expect(classifyAgentTool('Write')).toBe('create')
    expect(classifyAgentTool('Edit')).toBe('edit')
  })

  it.each([
    'WebFetch',
    'AskUserQuestion',
    'delegate_task',
    'browser_navigate',
    'TotallyUnknownTool'
  ])('returns null for %s', (toolName) => {
    expect(classifyAgentTool(toolName)).toBeNull()
  })
})

describe('relativizeToWorktree', () => {
  it('relativizes a path under the root, stripping the leading separator', () => {
    expect(relativizeToWorktree('/root/wt/src/a.ts', '/root/wt')).toBe('src/a.ts')
  })

  it('folds case and separators for the prefix test but slices the original string', () => {
    expect(relativizeToWorktree('/Root/WT/src/A.ts', '/root/wt')).toBe('src/A.ts')
  })

  it('relativizes a POSIX path even when the root differs only in case', () => {
    expect(relativizeToWorktree('/root/wt/src/b.ts', '/ROOT/WT')).toBe('src/b.ts')
  })

  it('returns the value unchanged when it is not under the root', () => {
    expect(relativizeToWorktree('/other/place/file.ts', '/root/wt')).toBe('/other/place/file.ts')
  })

  it('relativizes a Windows path preserving backslash separators', () => {
    expect(relativizeToWorktree('C:\\wt\\src\\a.ts', 'C:\\wt')).toBe('src\\a.ts')
  })
})
