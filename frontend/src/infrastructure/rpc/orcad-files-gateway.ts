import type { RuntimeGateway } from '../../application/ports/runtime-gateway'
import type { FilePathMatch } from '../../application/ports/runtime-gateway'
import type { RpcCaller } from './orcad-gateway'

export type FilesMethods = Pick<
  RuntimeGateway,
  'filesSearchPaths' | 'filesRead' | 'filesStat' | 'filesWrite'
>

const HOST_LIMIT_MAX = 32
const DEFAULT_LIMIT = 20

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toMatches(files: unknown): FilePathMatch[] {
  if (!Array.isArray(files)) return []
  return files.flatMap((file) =>
    isRecord(file) && typeof file.relativePath === 'string'
      ? [
          {
            relativePath: file.relativePath,
            basename:
              typeof file.basename === 'string'
                ? file.basename
                : (file.relativePath.split('/').pop() ?? file.relativePath),
            binary: file.kind === 'binary'
          }
        ]
      : []
  )
}

/** files.* gateway (quick-open, read, stat, write), its own module because orcad-gateway.ts is at its max-lines budget. */
export function createFilesMethods(connection: { call: RpcCaller }): FilesMethods {
  return {
    async filesSearchPaths(worktree, query, limit = DEFAULT_LIMIT) {
      const response = await connection.call('files.searchPaths', {
        worktree,
        query,
        limit: Math.min(limit, HOST_LIMIT_MAX),
        mode: 'quick-open'
      })
      const result = isRecord(response.result) ? response.result : {}
      return {
        files: toMatches(result.files),
        truncated: result.truncated === true
      }
    },
    async filesRead(worktree, relativePath) {
      const response = await connection.call('files.read', {
        worktree,
        relativePath
      })
      const result = response.result
      if (!isRecord(result) || typeof result.content !== 'string') {
        throw new Error('files.read returned no text content')
      }
      return {
        content: result.content,
        truncated: result.truncated === true,
        byteLength:
          typeof result.byteLength === 'number' ? result.byteLength : result.content.length
      }
    },
    async filesStat(worktree, relativePath) {
      const response = await connection.call('files.stat', {
        worktree,
        relativePath
      })
      const result = response.result
      if (
        !isRecord(result) ||
        typeof result.size !== 'number' ||
        typeof result.mtime !== 'number'
      ) {
        throw new Error('files.stat returned no size and mtime')
      }
      return { size: result.size, mtime: result.mtime }
    },
    async filesWrite(worktree, relativePath, content) {
      await connection.call('files.write', { worktree, relativePath, content })
    }
  }
}
