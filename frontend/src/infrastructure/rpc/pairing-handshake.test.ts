import { describe, expect, it } from 'vitest'
import { createPairingHandshake, RUNTIME_CLIENT_CAPABILITIES } from './pairing-handshake'
import { base64ToBytes } from './base64-binary'
import { decrypt, decryptBytes, encrypt, encryptBytes } from './e2ee-box'
import { ORCAD_WIRE_VECTORS } from './orcad-wire-vectors'

const vectors = ORCAD_WIRE_VECTORS
const sharedKey = base64ToBytes(vectors.keys.sharedKeyB64)
const injectedKeyPair = {
  publicKey: base64ToBytes(vectors.keys.clientPublicKeyB64),
  secretKey: base64ToBytes(vectors.keys.clientSecretKeyB64)
}

function createVectorHandshake() {
  return createPairingHandshake({
    deviceToken: vectors.pairing.offer.deviceToken,
    serverPublicKeyB64: vectors.keys.serverPublicKeyB64,
    keyPair: injectedKeyPair
  })
}

describe('createPairingHandshake — start()', () => {
  it('sends the plaintext e2ee_hello frame with our public key and moves to awaiting_ready (CO-102)', () => {
    const handshake = createVectorHandshake()
    const effects = handshake.start()
    expect(effects).toEqual([{ kind: 'send', frame: vectors.handshake.helloPlaintext }])
    expect(handshake.state).toBe('awaiting_ready')
    expect(handshake.stage).toBe('connect')
  })
})

describe('createPairingHandshake — awaiting_ready', () => {
  it('on a valid e2ee_ready frame, sends a sealed e2ee_auth frame and moves to awaiting_authenticated (CO-104)', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    const effects = handshake.onTextFrame(vectors.handshake.readyPlaintext)
    expect(effects).toHaveLength(1)
    const effect = effects[0]!
    if (effect.kind !== 'send') throw new Error('expected a send effect')
    expect(decrypt(effect.frame, sharedKey)).toBe(vectors.handshake.authPlaintext)
    expect(RUNTIME_CLIENT_CAPABILITIES).toEqual([])
    expect(handshake.state).toBe('awaiting_authenticated')
  })

  it('fails invalid_runtime_response/host-identity on unparsable JSON (CO-103)', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    const effects = handshake.onTextFrame('not json')
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
    expect(handshake.state).toBe('failed')
    expect(handshake.stage).toBe('host-identity')
  })

  it('fails invalid_runtime_response/host-identity on parsable JSON with the wrong type (CO-103)', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    const effects = handshake.onTextFrame(JSON.stringify({ type: 'not_ready' }))
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })

  it('fails invalid_runtime_response/host-identity on a binary frame (CO-107)', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    const effects = handshake.onBinaryFrame(new Uint8Array([1, 2, 3]))
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })
})

describe('createPairingHandshake — awaiting_authenticated', () => {
  function advanceToAwaitingAuthenticated() {
    const handshake = createVectorHandshake()
    handshake.start()
    handshake.onTextFrame(vectors.handshake.readyPlaintext)
    return handshake
  }

  it('fails invalid_runtime_response/host-identity on an undecryptable frame (CO-105)', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const effects = handshake.onTextFrame('garbage!!!not-a-sealed-frame')
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })

  it('fails invalid_runtime_response/host-identity when decrypted plaintext is unparsable JSON (CO-105)', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const sealed = encrypt('not json', sharedKey)
    const effects = handshake.onTextFrame(sealed)
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })

  it('on e2ee_authenticated, emits ready and moves to ready (CO-105)', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const sealed = encrypt(vectors.handshake.authenticatedPlaintext, sharedKey)
    const effects = handshake.onTextFrame(sealed)
    expect(effects).toEqual([{ kind: 'ready' }])
    expect(handshake.state).toBe('ready')
    expect(handshake.stage).toBe('runtime')
  })

  it('fails unauthorized/access-grant on e2ee_error{code:unauthorized} (CO-105, the one differing code/stage pair)', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const sealed = encrypt(vectors.handshake.unauthorizedPlaintext, sharedKey)
    const effects = handshake.onTextFrame(sealed)
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({ code: 'unauthorized', stage: 'access-grant' })
      }
    ])
    expect(handshake.stage).toBe('access-grant')
  })

  it('fails invalid_runtime_response/host-identity on e2ee_error{code:bad_auth} — NOT unauthorized (CO-105)', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const sealed = encrypt(vectors.handshake.badAuthPlaintext, sharedKey)
    const effects = handshake.onTextFrame(sealed)
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })

  it('fails invalid_runtime_response/host-identity on any other decrypted object', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const sealed = encrypt(JSON.stringify({ type: 'something_else' }), sharedKey)
    const effects = handshake.onTextFrame(sealed)
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })

  it('fails invalid_runtime_response/host-identity on a binary frame', () => {
    const handshake = advanceToAwaitingAuthenticated()
    const effects = handshake.onBinaryFrame(new Uint8Array([1, 2, 3]))
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'invalid_runtime_response',
          stage: 'host-identity'
        })
      }
    ])
  })
})

describe('createPairingHandshake — ready', () => {
  function advanceToReady() {
    const handshake = createVectorHandshake()
    handshake.start()
    handshake.onTextFrame(vectors.handshake.readyPlaintext)
    handshake.onTextFrame(encrypt(vectors.handshake.authenticatedPlaintext, sharedKey))
    return handshake
  }

  it('delivers plaintext for a frame that opens successfully; state stays ready', () => {
    const handshake = advanceToReady()
    const sealed = encrypt(vectors.rpc.responsePlaintext, sharedKey)
    const effects = handshake.onTextFrame(sealed)
    expect(effects).toEqual([{ kind: 'deliver', plaintext: vectors.rpc.responsePlaintext }])
    expect(handshake.state).toBe('ready')
  })

  it('fails invalid_runtime_response/runtime when open() returns null (CO-106, distinct stage)', () => {
    const handshake = advanceToReady()
    const effects = handshake.onTextFrame('undecryptable-garbage!!!')
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({ code: 'invalid_runtime_response', stage: 'runtime' })
      }
    ])
  })

  it('fails invalid_runtime_response/runtime on an undecryptable binary frame', () => {
    const handshake = advanceToReady()
    const effects = handshake.onBinaryFrame(new Uint8Array([1, 2, 3]))
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({ code: 'invalid_runtime_response', stage: 'runtime' })
      }
    ])
  })

  it('decrypts a genuine binary frame and delivers it as deliver-binary; state stays ready', () => {
    const handshake = advanceToReady()
    const payload = new Uint8Array([0, 1, 2, 127, 128, 254, 255])
    const sealed = encryptBytes(payload, sharedKey)
    const effects = handshake.onBinaryFrame(sealed)
    expect(effects).toEqual([{ kind: 'deliver-binary', bytes: payload }])
    expect(handshake.state).toBe('ready')
  })

  it('sealBinary() returns a sealed frame the mirror shared key can decrypt back to the same bytes', () => {
    const handshake = advanceToReady()
    const payload = new Uint8Array([9, 8, 7, 6])
    const sealed = handshake.sealBinary(payload)
    expect(decryptBytes(sealed, sharedKey)).toEqual(payload)
  })

  it('sealBinary() throws when state !== ready', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    expect(() => handshake.sealBinary(new Uint8Array([1]))).toThrow()
  })

  it('sealRequest() returns a sealed frame the mirror shared key can decrypt back to the plaintext', () => {
    const handshake = advanceToReady()
    const sealed = handshake.sealRequest(vectors.rpc.requestPlaintext)
    expect(decrypt(sealed, sharedKey)).toBe(vectors.rpc.requestPlaintext)
  })
})

describe('createPairingHandshake — onClose at each stage (CO-106)', () => {
  it('fails remote_runtime_unavailable + closeCode at awaiting_ready, stage connect', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    const effects = handshake.onClose(1006, 'abnormal closure')
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'remote_runtime_unavailable',
          stage: 'connect',
          closeCode: 1006
        })
      }
    ])
  })

  it('fails remote_runtime_unavailable + closeCode at awaiting_authenticated, stage host-identity', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    handshake.onTextFrame(vectors.handshake.readyPlaintext)
    const effects = handshake.onClose(1000, 'closed')
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'remote_runtime_unavailable',
          stage: 'host-identity',
          closeCode: 1000
        })
      }
    ])
  })

  it('fails remote_runtime_unavailable + closeCode at ready, stage runtime', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    handshake.onTextFrame(vectors.handshake.readyPlaintext)
    handshake.onTextFrame(encrypt(vectors.handshake.authenticatedPlaintext, sharedKey))
    const effects = handshake.onClose(1011, 'server error')
    expect(effects).toEqual([
      {
        kind: 'fail',
        failure: expect.objectContaining({
          code: 'remote_runtime_unavailable',
          stage: 'runtime',
          closeCode: 1011
        })
      }
    ])
  })
})

describe('createPairingHandshake — failed is idempotent', () => {
  it('emits no further effects once failed', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    handshake.onTextFrame('garbage')
    expect(handshake.state).toBe('failed')
    expect(handshake.onTextFrame('anything')).toEqual([])
    expect(handshake.onBinaryFrame(new Uint8Array([1, 2, 3]))).toEqual([])
    expect(handshake.onClose(1000, 'x')).toEqual([])
  })
})

describe('createPairingHandshake — sealRequest guard', () => {
  it('throws when state !== ready', () => {
    const handshake = createVectorHandshake()
    handshake.start()
    expect(() => handshake.sealRequest('x')).toThrow()
  })
})
