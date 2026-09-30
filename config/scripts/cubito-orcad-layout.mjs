// What Cubito's plain-Node `out/orcad` must hold beside orcad.js. Pure so it is testable
// without running a build. Upstream packages orcad with Bun (build-orcad-bun.mjs); Cubito does not.

/** One flat output per ORCAD_CHILD_ENTRY_POINTS key: each runtime resolver probes orcad.js's dir. */
export const CUBITO_ORCAD_CHILD_OUTPUTS = {
  watcher: 'parcel-watcher-process-entry.js',
  daemon: 'daemon-entry.js',
  ptyGate: 'windows-bun-pty-gate-entry.js',
  writer: 'profile-state-writer-worker-entry.js',
  backup: 'profile-state-backup-worker-entry.js'
}

// Why none of these may exist: handoffToBundledOrcad treats any of them as a Bun package and
// throws at startup when the Bun runtime beside it is missing.
export const BUN_PACKAGE_MARKERS = ['.version', '.build-target', 'bun-runtime', 'bun-runtime.exe']

export const EMOJI_SHORTCODE_DATASET = 'node_modules/emojibase-data/en/shortcodes/emojibase.json'

/** orcad reports isPackaged, so bundled-ripgrep-path only looks under its install root. */
export function ripgrepArtifact(platform = process.platform, arch = process.arch) {
  return `ripgrep/${platform}-${arch}/${platform === 'win32' ? 'rg.exe' : 'rg'}`
}

export function cubitoOrcadRequiredFiles(platform = process.platform, arch = process.arch) {
  return [
    'orcad.js',
    ...Object.values(CUBITO_ORCAD_CHILD_OUTPUTS),
    EMOJI_SHORTCODE_DATASET,
    ripgrepArtifact(platform, arch)
  ]
}
