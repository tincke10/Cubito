import { posix } from 'node:path'
import type { IFilesystemProvider } from '../providers/types'
import type { WorktreeSourceReader } from './worktree-source-reader'

const MAX_FILE_BYTES = 128 * 1024

/** SSH `WorktreeSourceReader` over an injected `IFilesystemProvider` (mirrors
 * repo-icon-autodetect's remote read path). Remote worktree roots are POSIX paths. */
export function createSshWorktreeSourceReader(
  fsProvider: IFilesystemProvider,
  rootPath: string
): WorktreeSourceReader {
  return {
    async readFileText(relativePath) {
      try {
        const absolutePath = posix.join(rootPath, relativePath)
        const info = await fsProvider.stat(absolutePath)
        if (info.type !== 'file' || info.size > MAX_FILE_BYTES) {
          return null
        }
        const result = await fsProvider.readFile(absolutePath)
        return result.isBinary ? null : result.content
      } catch {
        return null
      }
    },

    async listDir(relativePath) {
      try {
        const entries = await fsProvider.readDir(posix.join(rootPath, relativePath))
        return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }))
      } catch {
        return []
      }
    },

    async readPackageJson() {
      try {
        const packageJsonPath = posix.join(rootPath, 'package.json')
        const info = await fsProvider.stat(packageJsonPath)
        if (info.type !== 'file' || info.size > MAX_FILE_BYTES) {
          return null
        }
        const result = await fsProvider.readFile(packageJsonPath)
        if (result.isBinary) {
          return null
        }
        return JSON.parse(result.content) as unknown
      } catch {
        return null
      }
    }
  }
}
