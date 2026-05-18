import { describe, expect, it } from 'vitest'

import { decodeMessage, encodeMessage } from '../src/envelope.js'

describe('envelope', () => {
  it('roundtrips a valid hello message', () => {
    const message = { v: 1, t: 'hello', role: 'viewer', clientId: 'viewer-1' } as const

    expect(decodeMessage(encodeMessage(message))).toEqual({ ok: true, value: message })
  })

  it('rejects garbage JSON', () => {
    expect(decodeMessage('{nope')).toEqual({ ok: false, reason: 'invalid-json' })
  })

  it('rejects unknown message types', () => {
    expect(decodeMessage(JSON.stringify({ v: 1, t: 'bogus' }))).toEqual({
      ok: false,
      reason: 'invalid-schema',
    })
  })

  it('rejects unsupported protocol versions', () => {
    expect(decodeMessage(JSON.stringify({ v: 2, t: 'ping' }))).toEqual({
      ok: false,
      reason: 'invalid-schema',
    })
  })
})
