/** Port for reading a worktree's source, local or SSH — adapters land in Wave 4. */
export type WorktreeSourceReader = {
  /** null if the file is missing, binary, or over the size cap. */
  readFileText(relativePath: string): Promise<string | null>
  listDir(relativePath: string): Promise<{ name: string; isDirectory: boolean }[]>
  /** null if package.json is missing, unreadable, or not valid JSON. */
  readPackageJson(): Promise<unknown | null>
}
