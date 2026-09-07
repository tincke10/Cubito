import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import type { AgentActivityKind } from './agent-activity-ring'

// Why: taken verbatim from the keys of TOOL_INPUT_KEYS_BY_TOOL
// (src/shared/agent-hook-listener/tool-input-preview.ts) — no new per-agent table.
const READ_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'read_file',
  'read_many_files',
  'read',
  'view',
  'view_file',
  'view_image',
  'glob',
  'grep',
  'search_file_content',
  'grep_search',
  'find_by_name',
  'list_dir',
  'search_files'
])

const EDIT_TOOLS = new Set([
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'edit_file',
  'edit',
  'replace',
  'search_replace',
  'patch',
  'apply_patch',
  'replace_file_content',
  'multi_replace_file_content'
])

const CREATE_TOOLS = new Set(['Write', 'Create', 'write_file', 'write_to_file', 'write', 'create'])

const RUN_TOOLS = new Set([
  'Bash',
  'bash',
  'Execute',
  'powershell',
  'terminal',
  'run_shell_command',
  'run_command',
  'run_terminal_cmd',
  'run_terminal_command',
  'exec_command',
  'shell_command',
  'execute_code'
])

/** Write→create, Edit→edit: no per-event stat on a possibly-remote host. */
export function classifyAgentTool(toolName: string): AgentActivityKind | null {
  if (READ_TOOLS.has(toolName)) {
    return 'read'
  }
  if (EDIT_TOOLS.has(toolName)) {
    return 'edit'
  }
  if (CREATE_TOOLS.has(toolName)) {
    return 'create'
  }
  if (RUN_TOOLS.has(toolName)) {
    return 'run'
  }
  return null
}

/** Case/separator-insensitive prefix test built on the shared comparator, but slices
 *  the ORIGINAL string so a remote path never gets rewritten with a foreign separator. */
export function relativizeToWorktree(value: string, worktreeRoot: string): string {
  const comparisonRoot = foldForComparison(worktreeRoot)
  const comparisonValue = foldForComparison(value)
  if (comparisonValue === comparisonRoot) {
    return ''
  }
  const boundary = comparisonRoot.endsWith('/') ? comparisonRoot : `${comparisonRoot}/`
  if (!comparisonValue.startsWith(boundary)) {
    return value
  }
  return value.slice(boundary.length)
}

// Why: normalizeRuntimePathForComparison only case-folds Windows-like roots; a
// worktree root can also sit on a case-insensitive POSIX mount (e.g. macOS), so
// fold case uniformly on top of it for this comparison only.
function foldForComparison(path: string): string {
  return normalizeRuntimePathForComparison(path).toLowerCase()
}
