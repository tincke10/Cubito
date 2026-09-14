import { join } from 'node:path'

const INDEX_FILE = 'index.html'
const WEB_INDEX_FILE = 'web-index.html'
const ASSETS_DIR = 'assets'

/** Root-level dist entries the static handler cannot serve — fails the build, not the browser. */
export function unservableDistEntries(entries) {
  return entries
    .filter((entry) => !(entry.name === INDEX_FILE && !entry.isDirectory()))
    .filter((entry) => !(entry.name === ASSETS_DIR && entry.isDirectory()))
    .map((entry) => entry.name)
}

/** Throws when the dist dir has nothing to stage — an unbuilt or wiped frontend build. */
export function assertStageableDist(distDir, entries) {
  if (entries.length === 0) {
    throw new Error(`${distDir} is empty — run \`pnpm --dir frontend run build\` first`)
  }
}

/** index.html -> web-index.html (the static handler's index name); assets/ copied recursively. */
export function webClientStagePlan(distDir, outDir) {
  return {
    removeDir: outDir,
    copies: [
      { from: join(distDir, INDEX_FILE), to: join(outDir, WEB_INDEX_FILE), recursive: false },
      { from: join(distDir, ASSETS_DIR), to: join(outDir, ASSETS_DIR), recursive: true }
    ]
  }
}
