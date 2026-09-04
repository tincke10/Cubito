import { describe, expect, it } from 'vitest'
import {
  TerminalStreamOpcode,
  encodeTerminalStreamFrame,
  decodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  decodeTerminalStreamJson,
  encodeTerminalStreamText,
  decodeTerminalStreamText
} from './terminal-stream-codec'

describe('terminal stream frame header (golden-byte mirror of src/shared/terminal-stream-protocol.ts)', () => {
  it('encodes the 16-byte header for an empty-payload Subscribe(9) control frame', () => {
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Subscribe,
      streamId: 0,
      seq: 0,
      payload: new Uint8Array(0)
    })
    expect(Array.from(frame)).toEqual([
      0x74,
      1,
      9,
      0, // kind, version, opcode, reserved
      0,
      0,
      0,
      0, // streamId LE(0)
      0,
      0,
      0,
      0, // seq high LE(0)
      0,
      0,
      0,
      0 // seq low LE(0)
    ])
  })

  it('encodes streamId and a 64-bit seq split as two little-endian u32 halves', () => {
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Output,
      streamId: 5,
      seq: 2 ** 32 + 2,
      payload: new Uint8Array(0)
    })
    expect(Array.from(frame)).toEqual([
      0x74,
      1,
      1,
      0,
      5,
      0,
      0,
      0,
      1,
      0,
      0,
      0, // seq high = floor(seq / 2^32) = 1
      2,
      0,
      0,
      0 // seq low = seq >>> 0 = 2
    ])
  })

  it('appends the payload immediately after the 16-byte header', () => {
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc])
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Input,
      streamId: 1,
      seq: 0,
      payload
    })
    expect(frame.byteLength).toBe(19)
    expect(Array.from(frame.slice(16))).toEqual([0xaa, 0xbb, 0xcc])
  })

  it('round-trips encode -> decode for every declared opcode', () => {
    const opcodes = Object.values(TerminalStreamOpcode).filter(
      (v): v is TerminalStreamOpcode => typeof v === 'number'
    )
    for (const opcode of opcodes) {
      const payload = new Uint8Array([1, 2, 3])
      const encoded = encodeTerminalStreamFrame({ opcode, streamId: 7, seq: 42, payload })
      const decoded = decodeTerminalStreamFrame(encoded)
      expect(decoded).toEqual({ opcode, streamId: 7, seq: 42, payload })
    }
  })

  it('decodes null for a frame shorter than the 16-byte header', () => {
    expect(decodeTerminalStreamFrame(new Uint8Array(10))).toBeNull()
  })

  it('decodes null for a mismatched kind or version byte', () => {
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Output,
      streamId: 0,
      seq: 0,
      payload: new Uint8Array(0)
    })
    const badKind = new Uint8Array(frame)
    badKind[0] = 0
    expect(decodeTerminalStreamFrame(badKind)).toBeNull()

    const badVersion = new Uint8Array(frame)
    badVersion[1] = 2
    expect(decodeTerminalStreamFrame(badVersion)).toBeNull()
  })

  // Rule: unknown opcodes must be dropped, never throw — a newer host may add opcodes.
  it('decodes null (droppable) for an unknown opcode, without throwing', () => {
    const frame = encodeTerminalStreamFrame({
      opcode: TerminalStreamOpcode.Output,
      streamId: 0,
      seq: 0,
      payload: new Uint8Array(0)
    })
    const unknownOpcode = new Uint8Array(frame)
    unknownOpcode[2] = 250
    expect(() => decodeTerminalStreamFrame(unknownOpcode)).not.toThrow()
    expect(decodeTerminalStreamFrame(unknownOpcode)).toBeNull()
  })
})

describe('terminal stream JSON payload codec', () => {
  it('round-trips a JSON payload', () => {
    const value = { type: 'subscribed', streamId: 1, cols: 80, rows: 24 }
    expect(decodeTerminalStreamJson(encodeTerminalStreamJson(value))).toEqual(value)
  })

  it('decodes null for malformed JSON, without throwing', () => {
    const garbage = new TextEncoder().encode('{not json')
    expect(() => decodeTerminalStreamJson(garbage)).not.toThrow()
    expect(decodeTerminalStreamJson(garbage)).toBeNull()
  })

  // WARNING-2 (mirrors src/shared/terminal-stream-protocol.ts's DoS guards).
  it('decodes null for a payload over the 8MB JSON size cap, without throwing', () => {
    const oversized = new TextEncoder().encode(`{"pad":"${'a'.repeat(8 * 1024 * 1024)}"}`)
    expect(() => decodeTerminalStreamJson(oversized)).not.toThrow()
    expect(decodeTerminalStreamJson(oversized)).toBeNull()
  })

  it('decodes null for pathologically deep JSON nesting, without throwing', () => {
    const deep = new TextEncoder().encode('['.repeat(40) + ']'.repeat(40))
    expect(() => decodeTerminalStreamJson(deep)).not.toThrow()
    expect(decodeTerminalStreamJson(deep)).toBeNull()
  })

  it('still round-trips a JSON payload well within both limits', () => {
    const value = { type: 'output', streamId: 3, data: [1, 2, [3, 4]] }
    expect(decodeTerminalStreamJson(encodeTerminalStreamJson(value))).toEqual(value)
  })
})

describe('terminal stream text payload codec', () => {
  it('round-trips UTF-8 text, e.g. raw PTY input', () => {
    const text = 'echo héllo\n'
    expect(decodeTerminalStreamText(encodeTerminalStreamText(text))).toBe(text)
  })
})
