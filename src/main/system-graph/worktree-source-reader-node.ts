import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { isBinaryBuffer } from '../../shared/binary-buffer'
import type { WorktreeSourceReader } from './worktree-source-reader'

const MAX_FILE_BYTES = 128 * 1024

/** Local `WorktreeSourceReader` over node `fs` (mirrors repo-icon-autodetect's local read path). */
export function createNodeWorktreeSourceReader(rootPath: string): WorktreeSourceReader {
  return {
    async readFileText(relativePath) {
      try {
        const absolutePath = join(rootPath, relativePath)
        const info = await stat(absolutePath)
        if (!info.isFile() || info.size > MAX_FILE_BYTES) {
          return null
        }
        const buffer = await readFile(absolutePath)
        return isBinaryBuffer(buffer) ? null : buffer.toString('utf8')
      } catch {
        return null
      }
    },

    async listDir(relativePath) {
      try {
        const entries = await readdir(join(rootPath, relativePath), { withFileTypes: true })
        return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
      } catch {
        return []
      }
    },

    async readPackageJson() {
      try {
        const content = await readFile(join(rootPath, 'package.json'), 'utf8')
        return JSON.parse(content) as unknown
      } catch {
        return null
      }
    }
  }
}
