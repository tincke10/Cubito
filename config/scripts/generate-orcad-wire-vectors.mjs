#!/usr/bin/env node
// Cross-vector generator/checker for the conexion-orcad browser pairing client.
//
// Generates `frontend/src/infrastructure/rpc/orcad-wire-vectors.ts` — a committed,
// zero-import fixture module — by driving the engine's REAL crypto/pairing code
// (`src/shared/e2ee-crypto.ts`, `src/shared/pairing.ts`) under plain node. Only the
// fixed keypairs are deterministic; every `sealed.*` ciphertext uses a fresh random
// nonce each run, so re-running this script legitimately changes the file. `--check`
// is the drift gate: it re-imports the committed file and replays every vector
// through the engine's own crypto/pairing functions, never against a byte diff.
import { createHash } from 'node:crypto'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
// The repo root deliberately has no node_modules (the engine runs in Docker), so bare
// 'tweetnacl' must resolve from the frontend workspace's copy — anchored via parentURL.
const FRONTEND_ANCHOR = pathToFileURL(path.resolve(SCRIPT_DIR, '../../frontend/package.json')).href

// `src/shared/pairing.ts` imports its siblings by extensionless specifier (fine for
// tsc/vite's bundler resolution, invalid under plain node's strict ESM resolver). This
// loader hook appends `.ts` to a relative specifier that node can't resolve as-is, and
// re-anchors bare 'tweetnacl' to the frontend workspace. Registered before every crypto
// import, which is why they are all dynamic below.
register(
  `data:text/javascript,${encodeURIComponent(
    `const FRONTEND_ANCHOR = ${JSON.stringify(FRONTEND_ANCHOR)}\n` +
      'export async function resolve(specifier, context, nextResolve) {\n' +
      "  if (specifier === 'tweetnacl' || specifier === 'zod') {\n" +
      '    return nextResolve(specifier, { ...context, parentURL: FRONTEND_ANCHOR })\n' +
      '  }\n' +
      "  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\\.[a-zA-Z0-9]+$/.test(specifier)) {\n" +
      '    try {\n' +
      "      return await nextResolve(specifier + '.ts', context)\n" +
      '    } catch {}\n' +
      '  }\n' +
      '  return nextResolve(specifier, context)\n' +
      '}\n'
  )}`,
  import.meta.url
)
const nacl = (await import('tweetnacl')).default
const { deriveSharedKey, encrypt, decrypt, publicKeyToBase64, MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS } =
  await import('../../src/shared/e2ee-crypto.ts')
const { encodePairingOffer, parsePairingCode } = await import('../../src/shared/pairing.ts')
const OUTPUT_PATH = path.resolve(SCRIPT_DIR, '../../frontend/src/infrastructure/rpc/orcad-wire-vectors.ts')
const GENERATOR_LABEL = 'config/scripts/generate-orcad-wire-vectors.mjs'
const DEVICE_TOKEN = 'orcad-wire-vector-device-token'
const REQUEST_ID = 'vector-request-1'
const RUNTIME_ID = 'vector-runtime-1'
const OVERSIZE_PLACEHOLDER = '__ORCAD_WIRE_VECTORS_OVERSIZE_PLACEHOLDER__'

function deterministicSecretKey(label) {
  return new Uint8Array(createHash('sha256').update(label).digest())
}

function bytesFromBase64(base64) {
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

function buildVectors() {
  const serverKeyPair = nacl.box.keyPair.fromSecretKey(
    deterministicSecretKey('orcad-wire-vectors:server-secret-key:v1')
  )
  const clientKeyPair = nacl.box.keyPair.fromSecretKey(
    deterministicSecretKey('orcad-wire-vectors:client-secret-key:v1')
  )
  const sharedKeyBytes = deriveSharedKey(clientKeyPair.secretKey, serverKeyPair.publicKey)

  const offer = {
    v: 2,
    endpoint: 'ws://127.0.0.1:5170',
    deviceToken: DEVICE_TOKEN,
    publicKeyB64: publicKeyToBase64(serverKeyPair.publicKey),
    scope: 'runtime'
  }
  const url = encodePairingOffer(offer)
  const codePrefix = 'orca://pair?code='
  if (!url.startsWith(codePrefix)) {
    throw new Error(`encodePairingOffer produced an unexpected shape: ${url}`)
  }
  const bareCode = url.slice(codePrefix.length)

  const handshake = {
    helloPlaintext: JSON.stringify({ type: 'e2ee_hello', publicKeyB64: publicKeyToBase64(clientKeyPair.publicKey) }),
    readyPlaintext: JSON.stringify({ type: 'e2ee_ready' }),
    authPlaintext: JSON.stringify({ type: 'e2ee_auth', deviceToken: DEVICE_TOKEN, clientCapabilities: [] }),
    authenticatedPlaintext: JSON.stringify({ type: 'e2ee_authenticated' }),
    unauthorizedPlaintext: JSON.stringify({ type: 'e2ee_error', error: { code: 'unauthorized' } }),
    badAuthPlaintext: JSON.stringify({ type: 'e2ee_error', error: { code: 'bad_auth' } })
  }

  const rpc = {
    requestPlaintext: JSON.stringify({ id: REQUEST_ID, deviceToken: DEVICE_TOKEN, method: 'worktree.list' }),
    responsePlaintext: JSON.stringify({
      id: REQUEST_ID,
      ok: true,
      result: { worktrees: [] },
      _meta: { runtimeId: RUNTIME_ID }
    })
  }
  const keepalivePlaintext = JSON.stringify({ _keepalive: true })

  const sealedAuthenticated = encrypt(handshake.authenticatedPlaintext, sharedKeyBytes)
  const truncatedBytes = bytesFromBase64(sealedAuthenticated).slice(0, 10)
  const nonBase64 = `${sealedAuthenticated.slice(0, 6)}!!!${sealedAuthenticated.slice(9)}`

  const sealed = {
    authenticated: sealedAuthenticated,
    unauthorized: encrypt(handshake.unauthorizedPlaintext, sharedKeyBytes),
    badAuth: encrypt(handshake.badAuthPlaintext, sharedKeyBytes),
    rpcResponse: encrypt(rpc.responsePlaintext, sharedKeyBytes),
    keepalive: encrypt(keepalivePlaintext, sharedKeyBytes),
    truncated: Buffer.from(truncatedBytes).toString('base64'),
    // Placeholder swapped for a computed `'A'.repeat(N)` expression in renderModule — the
    // real value is ~5.6M chars (MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS is derived from a 4MB
    // plaintext cap) and would bloat the committed module if inlined as a literal.
    oversize: OVERSIZE_PLACEHOLDER,
    nonBase64
  }

  return {
    oversizeLength: MAX_E2EE_ENCRYPTED_BASE64_CHARACTERS + 4,
    vectors: {
      generatedBy: GENERATOR_LABEL,
      formatVersion: 1,
      keys: {
        serverPublicKeyB64: publicKeyToBase64(serverKeyPair.publicKey),
        serverSecretKeyB64: publicKeyToBase64(serverKeyPair.secretKey),
        clientPublicKeyB64: publicKeyToBase64(clientKeyPair.publicKey),
        clientSecretKeyB64: publicKeyToBase64(clientKeyPair.secretKey),
        sharedKeyB64: publicKeyToBase64(sharedKeyBytes)
      },
      pairing: { offer, url, bareCode },
      handshake,
      sealed,
      rpc: { requestPlaintext: rpc.requestPlaintext, responsePlaintext: rpc.responsePlaintext, keepalivePlaintext }
    }
  }
}

function renderModule(vectors, oversizeLength) {
  const objectLiteral = JSON.stringify(vectors, null, 2).replace(
    `"${OVERSIZE_PLACEHOLDER}"`,
    `'A'.repeat(${oversizeLength})`
  )
  return `// GENERATED by ${GENERATOR_LABEL} — do not edit by hand.
export type OrcadWireVectors = {
  generatedBy: string
  formatVersion: 1
  keys: {
    serverPublicKeyB64: string
    serverSecretKeyB64: string
    clientPublicKeyB64: string
    clientSecretKeyB64: string
    sharedKeyB64: string
  }
  pairing: {
    offer: { v: 2; endpoint: string; deviceToken: string; publicKeyB64: string; scope: 'runtime' }
    url: string
    bareCode: string
  }
  handshake: {
    helloPlaintext: string
    readyPlaintext: string
    authPlaintext: string
    authenticatedPlaintext: string
    unauthorizedPlaintext: string
    badAuthPlaintext: string
  }
  sealed: {
    authenticated: string
    unauthorized: string
    badAuth: string
    rpcResponse: string
    keepalive: string
    truncated: string
    oversize: string
    nonBase64: string
  }
  rpc: { requestPlaintext: string; responsePlaintext: string; keepalivePlaintext: string }
}

export const ORCAD_WIRE_VECTORS: OrcadWireVectors = ${objectLiteral}
`
}

function fail(message) {
  console.error(`generate-orcad-wire-vectors: ${message}`)
  process.exitCode = 1
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`mismatch for ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    return false
  }
  return true
}

function assertDeepEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    fail(`mismatch for ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
  return ok
}

async function runCheck() {
  const moduleUrl = `${pathToFileURL(OUTPUT_PATH).href}?checkedAt=${Date.now()}`
  const { ORCAD_WIRE_VECTORS: vectors } = await import(moduleUrl)

  const sharedKeyBytes = deriveSharedKey(
    bytesFromBase64(vectors.keys.clientSecretKeyB64),
    bytesFromBase64(vectors.keys.serverPublicKeyB64)
  )
  let ok = assertEqual(
    publicKeyToBase64(sharedKeyBytes),
    vectors.keys.sharedKeyB64,
    'keys.sharedKeyB64 (re-derived)'
  )

  const decryptedChecks = [
    ['sealed.authenticated', vectors.sealed.authenticated, vectors.handshake.authenticatedPlaintext],
    ['sealed.unauthorized', vectors.sealed.unauthorized, vectors.handshake.unauthorizedPlaintext],
    ['sealed.badAuth', vectors.sealed.badAuth, vectors.handshake.badAuthPlaintext],
    ['sealed.rpcResponse', vectors.sealed.rpcResponse, vectors.rpc.responsePlaintext],
    ['sealed.keepalive', vectors.sealed.keepalive, vectors.rpc.keepalivePlaintext]
  ]
  for (const [label, ciphertext, plaintext] of decryptedChecks) {
    ok = assertEqual(decrypt(ciphertext, sharedKeyBytes), plaintext, label) && ok
  }

  const nullChecks = ['truncated', 'oversize', 'nonBase64']
  for (const key of nullChecks) {
    ok = assertEqual(decrypt(vectors.sealed[key], sharedKeyBytes), null, `sealed.${key} (must decrypt to null)`) && ok
  }

  ok = assertDeepEqual(parsePairingCode(vectors.pairing.url), vectors.pairing.offer, 'pairing.url round-trip') && ok
  ok =
    assertDeepEqual(parsePairingCode(vectors.pairing.bareCode), vectors.pairing.offer, 'pairing.bareCode round-trip') &&
    ok

  if (ok) {
    console.log('generate-orcad-wire-vectors --check: all vectors replay cleanly against the engine crypto.')
  }
}

async function main() {
  const checkMode = process.argv.includes('--check')
  if (checkMode) {
    await runCheck()
    return
  }
  const { vectors, oversizeLength } = buildVectors()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(OUTPUT_PATH, renderModule(vectors, oversizeLength), 'utf-8')
  console.log(`generate-orcad-wire-vectors: wrote ${path.relative(process.cwd(), OUTPUT_PATH)}`)
}

await main()
