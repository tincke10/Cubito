/**
 * Mirror of `src/shared/terminal-stream-protocol.ts` (rpc-purity forbids importing src/shared).
 * Byte-exact: 16-byte little-endian header, opcode-numbering, and JSON/text payload codecs must
 * match the engine exactly — this is the wire contract for orcad's terminal.multiplex.
 */

const TERMINAL_STREAM_KIND = 0x74
const TERMINAL_STREAM_VERSION = 1
const HEADER_BYTES = 16
// DoS guards mirrored from src/shared/json-text-structure-limit.ts (rpc-purity forbids importing it).
const JSON_MAX_BYTES = 8 * 1024 * 1024
const JSON_STRUCTURAL_TOKEN_LIMIT = 256 * 1024
const JSON_NESTING_DEPTH_LIMIT = 32

export enum TerminalStreamOpcode {
  Output = 1,
  SnapshotStart = 2,
  SnapshotChunk = 3,
  SnapshotEnd = 4,
  Resized = 5,
  Error = 6,
  Input = 7,
  Resize = 8,
  Subscribe = 9,
  Unsubscribe = 10,
  SnapshotRequest = 11,
  Metadata = 12,
  Ack = 13,
  ClaimViewport = 14,
  OutputSpan = 15,
  SetOutputPaused = 16,
  WriteUnavailable = 17
}

export type TerminalStreamFrame = {
  opcode: TerminalStreamOpcode
  streamId: number
  seq: number
  payload: Uint8Array
}

export function encodeTerminalStreamFrame(frame: TerminalStreamFrame): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + frame.payload.length)
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  view.setUint8(0, TERMINAL_STREAM_KIND)
  view.setUint8(1, TERMINAL_STREAM_VERSION)
  view.setUint8(2, frame.opcode)
  view.setUint8(3, 0)
  view.setUint32(4, frame.streamId, true)
  const seq = Math.max(0, Math.floor(frame.seq))
  view.setUint32(8, Math.floor(seq / 0x100000000), true)
  view.setUint32(12, seq >>> 0, true)
  out.set(frame.payload, HEADER_BYTES)
  return out
}

export function decodeTerminalStreamFrame(bytes: Uint8Array): TerminalStreamFrame | null {
  if (bytes.length < HEADER_BYTES) {
    return null
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint8(0) !== TERMINAL_STREAM_KIND || view.getUint8(1) !== TERMINAL_STREAM_VERSION) {
    return null
  }
  const opcode = view.getUint8(2)
  if (!isTerminalStreamOpcode(opcode)) {
    return null
  }
  const high = view.getUint32(8, true)
  const low = view.getUint32(12, true)
  return {
    opcode,
    streamId: view.getUint32(4, true),
    seq: high * 0x100000000 + low,
    payload: bytes.slice(HEADER_BYTES)
  }
}

export function encodeTerminalStreamJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

export function decodeTerminalStreamJson<T>(payload: Uint8Array): T | null {
  if (payload.byteLength > JSON_MAX_BYTES) {
    return null
  }
  try {
    const content = new TextDecoder().decode(payload)
    assertJsonStructureWithinLimits(content)
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

/** Ported algorithm from src/shared/json-text-structure-limit.ts — throws past a token/depth cap. */
function assertJsonStructureWithinLimits(content: string): void {
  let structuralTokens = 0
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (
      character !== '{' &&
      character !== '}' &&
      character !== '[' &&
      character !== ']' &&
      character !== ',' &&
      character !== ':'
    ) {
      continue
    }
    structuralTokens += 1
    if (structuralTokens > JSON_STRUCTURAL_TOKEN_LIMIT) {
      throw new Error('JSON structure exceeds token limit')
    }
    if (character === '{' || character === '[') {
      depth += 1
      if (depth > JSON_NESTING_DEPTH_LIMIT) {
        throw new Error('JSON nesting exceeds depth limit')
      }
    } else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1)
    }
  }
}

export function encodeTerminalStreamText(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function decodeTerminalStreamText(payload: Uint8Array): string {
  return new TextDecoder().decode(payload)
}

function isTerminalStreamOpcode(value: number): value is TerminalStreamOpcode {
  return (
    value === TerminalStreamOpcode.Output ||
    value === TerminalStreamOpcode.SnapshotStart ||
    value === TerminalStreamOpcode.SnapshotChunk ||
    value === TerminalStreamOpcode.SnapshotEnd ||
    value === TerminalStreamOpcode.Resized ||
    value === TerminalStreamOpcode.Error ||
    value === TerminalStreamOpcode.Input ||
    value === TerminalStreamOpcode.Resize ||
    value === TerminalStreamOpcode.Subscribe ||
    value === TerminalStreamOpcode.Unsubscribe ||
    value === TerminalStreamOpcode.SnapshotRequest ||
    value === TerminalStreamOpcode.Metadata ||
    value === TerminalStreamOpcode.Ack ||
    value === TerminalStreamOpcode.ClaimViewport ||
    value === TerminalStreamOpcode.OutputSpan ||
    value === TerminalStreamOpcode.SetOutputPaused ||
    value === TerminalStreamOpcode.WriteUnavailable
  )
}
