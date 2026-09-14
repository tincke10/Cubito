import { join } from 'node:path'

const DEFAULT_ORCAD_PORT = 6799
const DEFAULT_FRONTEND_PORT = 5180
const PROFILE_ID = 'local-default'

/** Isolated launch plan: flags beat env, env beats defaults — never `~/.orca` or `~/orca/workspaces`. */
export function resolveLaunchPlan({ argv, env, homedir, platform, repoRoot }) {
  const flags = parseFlags(argv)
  const dataDir = flags.dataDir ?? env.ORCA_USER_DATA ?? join(homedir, '.cubito')
  const worktreeRoot =
    flags.worktreeRoot ?? env.CUBITO_WORKTREE_ROOT ?? join(homedir, 'cubito', 'workspaces')
  const orcadPort = flags.orcadPort ?? numberEnv(env.CUBITO_ORCAD_PORT) ?? DEFAULT_ORCAD_PORT
  const frontendPort =
    flags.frontendPort ?? numberEnv(env.CUBITO_FRONTEND_PORT) ?? DEFAULT_FRONTEND_PORT
  const webClientRoot = join(repoRoot, 'out', 'orcad', 'web-client')
  const orcadArgs = ['--port', String(orcadPort), '--json', '--web-client-root', webClientRoot]
  if (env.CUBITO_ORCAD_BIND) {
    orcadArgs.push('--bind', env.CUBITO_ORCAD_BIND)
  }
  if (env.CUBITO_PAIRING_ADDRESS) {
    orcadArgs.push('--pairing-address', env.CUBITO_PAIRING_ADDRESS)
  }
  const openInBrowser = platform === 'darwin' && !flags.noOpen && !env.CUBITO_NO_OPEN
  return { dataDir, worktreeRoot, orcadPort, frontendPort, webClientRoot, orcadArgs, openInBrowser }
}

/** `null` for absent/non-numeric so a caller's `??` chain falls through cleanly. */
function numberEnv(value) {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseFlags(argv) {
  const flags = {
    dataDir: null,
    worktreeRoot: null,
    orcadPort: null,
    frontendPort: null,
    noOpen: false
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--data-dir') {
      flags.dataDir = argv[++i]
    } else if (arg === '--worktree-root') {
      flags.worktreeRoot = argv[++i]
    } else if (arg === '--port') {
      flags.orcadPort = Number(argv[++i])
    } else if (arg === '--frontend-port') {
      flags.frontendPort = Number(argv[++i])
    } else if (arg === '--no-open') {
      flags.noOpen = true
    }
  }
  return flags
}

const DAEMON_SOCKET_DIR = '/daemon/'
// Observed socket name `.p94b43b2e22` is 12 chars; +1 margin so a 13-char name still fits.
const SOCKET_NAME_MARGIN = 13
const SUN_PATH_LIMITS = { darwin: 104, linux: 108 }

/** `null`, or a message, if `dataDir`'s worst-case daemon socket path would exceed the OS's `sun_path` limit. */
export function dataDirSocketPathProblem(dataDir, platform) {
  const limit = SUN_PATH_LIMITS[platform]
  if (limit === undefined) {
    return null
  }
  const worstCaseLength = dataDir.length + DAEMON_SOCKET_DIR.length + SOCKET_NAME_MARGIN
  if (worstCaseLength <= limit) {
    return null
  }
  return (
    `data dir "${dataDir}" would produce a daemon socket path of ~${worstCaseLength} chars, ` +
    `over the ${platform} unix socket limit of ${limit}. Use a shorter --data-dir or ` +
    `ORCA_USER_DATA, e.g. ~/.cubito.`
  )
}

/** Where orcad's `local-default` profile persists global settings under a given data dir. */
export function settingsSeedPath(dataDir) {
  return join(dataDir, 'profiles', PROFILE_ID, 'orca-data.json')
}

/** Partial-merge-safe: `normalize-loaded-global-settings.ts` spreads defaults first. */
export function settingsSeedContent(worktreeRoot) {
  return { settings: { workspaceDir: worktreeRoot } }
}

/** Parses one orcad stdout line; `null` unless it is the ready payload carrying a pairing url. */
export function parseReadinessLine(line) {
  let payload
  try {
    payload = JSON.parse(line)
  } catch {
    return null
  }
  if (!payload || payload.type !== 'orca_server_ready' || !payload.pairing?.url) {
    return null
  }
  return { pairingUrl: payload.pairing.url, webClientUrl: payload.pairing.webClientUrl ?? null }
}

/** The frontend URL that carries the pairing offer in its fragment. */
export function composeFrontendUrl(frontendPort, pairingUrl) {
  return `http://localhost:${frontendPort}/#pairing=${encodeURIComponent(pairingUrl)}`
}
