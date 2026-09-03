/**
 * Pure, effect-returning v1 pairing handshake state machine — no I/O, no timers.
 * Ports the transition table from `src/shared/remote-runtime-request-response-router.ts`
 * (+ `remote-runtime-client-handshake.ts`) for a persistent (not one-shot) socket.
 */
import {
  deriveSharedKey,
  generateKeyPair,
  publicKeyFromBase64,
  publicKeyToBase64,
  type E2eeKeyPair
} from './e2ee-box'
import { createE2eeFrameCodec, type E2eeFrameCodec } from './e2ee-frame-codec'

// v1 sends no capabilities: claiming one we have not implemented is the actual bug.
// Source of truth for the full list: src/shared/remote-runtime-client-capabilities.ts.
export const RUNTIME_CLIENT_CAPABILITIES: readonly string[] = []

export type PairingStage = 'connect' | 'host-identity' | 'access-grant' | 'runtime'
export type HandshakeState = 'awaiting_ready' | 'awaiting_authenticated' | 'ready' | 'failed'

export type HandshakeFailure = {
  code: 'invalid_runtime_response' | 'unauthorized' | 'remote_runtime_unavailable'
  message: string
  stage: PairingStage
  closeCode?: number
}

export type HandshakeEffect =
  | { kind: 'send'; frame: string }
  | { kind: 'ready' }
  | { kind: 'deliver'; plaintext: string }
  | { kind: 'deliver-binary'; bytes: Uint8Array }
  | { kind: 'fail'; failure: HandshakeFailure }

export type PairingHandshakeOptions = {
  deviceToken: string
  serverPublicKeyB64: string
  clientCapabilities?: readonly string[]
  /** Injected by vector tests; a fresh ephemeral keypair is generated otherwise (CO-101). */
  keyPair?: E2eeKeyPair
}

export type PairingHandshake = {
  readonly state: HandshakeState
  readonly stage: PairingStage
  start(): readonly HandshakeEffect[]
  onTextFrame(frame: string): readonly HandshakeEffect[]
  onBinaryFrame(bytes: Uint8Array): readonly HandshakeEffect[]
  onClose(code: number, reason: string): readonly HandshakeEffect[]
  sealRequest(plaintext: string): string
  sealBinary(bytes: Uint8Array): Uint8Array
}

function stageForState(state: Exclude<HandshakeState, 'failed'>): PairingStage {
  if (state === 'awaiting_ready') return 'connect'
  if (state === 'awaiting_authenticated') return 'host-identity'
  return 'runtime'
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function hasType(value: unknown, type: string): boolean {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === type
}

export function createPairingHandshake(options: PairingHandshakeOptions): PairingHandshake {
  const keyPair = options.keyPair ?? generateKeyPair()
  const serverPublicKey = publicKeyFromBase64(options.serverPublicKeyB64)
  const sharedKey = deriveSharedKey(keyPair.secretKey, serverPublicKey)
  const codec: E2eeFrameCodec = createE2eeFrameCodec(sharedKey)
  const clientCapabilities = options.clientCapabilities ?? RUNTIME_CLIENT_CAPABILITIES

  let state: HandshakeState = 'awaiting_ready'
  let failedStage: PairingStage = 'connect'

  function fail(
    code: HandshakeFailure['code'],
    message: string,
    stage: PairingStage,
    closeCode?: number
  ): readonly HandshakeEffect[] {
    state = 'failed'
    failedStage = stage
    const failure: HandshakeFailure =
      closeCode === undefined ? { code, message, stage } : { code, message, stage, closeCode }
    return [{ kind: 'fail', failure }]
  }

  function handleAwaitingReadyText(frame: string): readonly HandshakeEffect[] {
    const parsed = parseJson(frame)
    if (!parsed.ok) {
      return fail(
        'invalid_runtime_response',
        'Remote Orca runtime returned an invalid E2EE handshake frame.',
        'host-identity'
      )
    }
    if (!hasType(parsed.value, 'e2ee_ready')) {
      return fail(
        'invalid_runtime_response',
        'Remote Orca runtime returned an unexpected E2EE handshake frame.',
        'host-identity'
      )
    }
    state = 'awaiting_authenticated'
    const authFrame = codec.seal(
      JSON.stringify({ type: 'e2ee_auth', deviceToken: options.deviceToken, clientCapabilities })
    )
    return [{ kind: 'send', frame: authFrame }]
  }

  function handleAwaitingAuthenticatedText(frame: string): readonly HandshakeEffect[] {
    const plaintext = codec.open(frame)
    if (plaintext === null) {
      return fail(
        'invalid_runtime_response',
        'Remote Orca runtime returned an undecryptable frame.',
        'host-identity'
      )
    }
    const parsed = parseJson(plaintext)
    if (!parsed.ok) {
      return fail(
        'invalid_runtime_response',
        'Remote Orca runtime returned an invalid E2EE auth frame.',
        'host-identity'
      )
    }
    if (hasType(parsed.value, 'e2ee_authenticated')) {
      state = 'ready'
      return [{ kind: 'ready' }]
    }
    const errorCode =
      typeof parsed.value === 'object' && parsed.value !== null
        ? (parsed.value as { error?: { code?: unknown } }).error?.code
        : undefined
    if (errorCode === 'unauthorized') {
      return fail('unauthorized', 'Remote Orca runtime rejected the pairing token.', 'access-grant')
    }
    return fail(
      'invalid_runtime_response',
      'Remote Orca runtime rejected the pairing token.',
      'host-identity'
    )
  }

  function handleReadyText(frame: string): readonly HandshakeEffect[] {
    const plaintext = codec.open(frame)
    if (plaintext === null) {
      return fail(
        'invalid_runtime_response',
        'Remote Orca runtime returned an undecryptable frame.',
        'runtime'
      )
    }
    return [{ kind: 'deliver', plaintext }]
  }

  return {
    get state() {
      return state
    },
    get stage() {
      return state === 'failed' ? failedStage : stageForState(state)
    },
    start(): readonly HandshakeEffect[] {
      const hello = JSON.stringify({
        type: 'e2ee_hello',
        publicKeyB64: publicKeyToBase64(keyPair.publicKey)
      })
      return [{ kind: 'send', frame: hello }]
    },
    onTextFrame(frame: string): readonly HandshakeEffect[] {
      if (state === 'failed') return []
      if (state === 'awaiting_ready') return handleAwaitingReadyText(frame)
      if (state === 'awaiting_authenticated') return handleAwaitingAuthenticatedText(frame)
      return handleReadyText(frame)
    },
    onBinaryFrame(bytes: Uint8Array): readonly HandshakeEffect[] {
      if (state === 'failed') return []
      if (state !== 'ready') {
        return fail(
          'invalid_runtime_response',
          'Remote Orca runtime returned an unexpected binary frame.',
          'host-identity'
        )
      }
      const plaintext = codec.openBytes(bytes)
      if (plaintext === null) {
        return fail(
          'invalid_runtime_response',
          'Remote Orca runtime returned an undecryptable binary frame.',
          'runtime'
        )
      }
      return [{ kind: 'deliver-binary', bytes: plaintext }]
    },
    onClose(code: number, reason: string): readonly HandshakeEffect[] {
      if (state === 'failed') return []
      const stage = stageForState(state)
      return fail(
        'remote_runtime_unavailable',
        reason || 'Remote Orca runtime closed the connection.',
        stage,
        code
      )
    },
    sealRequest(plaintext: string): string {
      if (state !== 'ready') {
        throw new Error('sealRequest called before the handshake reached ready')
      }
      return codec.seal(plaintext)
    },
    sealBinary(bytes: Uint8Array): Uint8Array {
      if (state !== 'ready') {
        throw new Error('sealBinary called before the handshake reached ready')
      }
      return codec.sealBytes(bytes)
    }
  }
}
