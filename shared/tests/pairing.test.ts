import { describe, expect, it } from 'vitest'

import { ErrorCode } from '../src/protocol/errors.js'
import { PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH, PAIR_CODE_TTL_MS } from '../src/constants.js'
import { PairStore, generatePairCode, verifyPairCode } from '../src/pairing.js'

describe('pairing', () => {
  it('generates legal pair codes with entropy', () => {
    const samples = Array.from({ length: 1000 }, () => generatePairCode())
    const legal = new RegExp(`^[${PAIR_CODE_ALPHABET}]{${PAIR_CODE_LENGTH}}$`)

    expect(samples.every((code) => legal.test(code))).toBe(true)
    expect(new Set(samples).size).toBeGreaterThan(990)
  })

  it('verifies equal length codes only', () => {
    expect(verifyPairCode('ABC234', 'ABC234')).toBe(true)
    expect(verifyPairCode('ABC234', 'ABC235')).toBe(false)
    expect(verifyPairCode('ABC234', 'ABC2345')).toBe(false)
  })

  it('creates an initial snapshot', () => {
    const store = new PairStore(() => 1000)
    const snapshot = store.snapshot()

    expect(snapshot.code).toHaveLength(PAIR_CODE_LENGTH)
    expect(snapshot.expiresAt).toBe(1000 + PAIR_CODE_TTL_MS)
    expect(snapshot.attempts).toBe(0)
    expect(snapshot).not.toHaveProperty('lockedUntil')
  })

  it('accepts a valid current code', () => {
    const store = new PairStore(() => 1000)

    expect(store.verify(store.snapshot().code)).toEqual({ ok: true })
  })

  it('rotates expired codes and reports expiry', () => {
    let now = 1000
    const store = new PairStore(() => now)
    const oldCode = store.snapshot().code
    now += PAIR_CODE_TTL_MS

    expect(store.verify(oldCode)).toEqual({ ok: false, reason: ErrorCode.E_PAIR_EXPIRED })
    expect(store.snapshot().code).not.toBe(oldCode)
    expect(store.snapshot().attempts).toBe(0)
  })

  it('locks a viewer and rotates after max wrong attempts', () => {
    let now = 1000
    const store = new PairStore(() => now)
    const oldCode = store.snapshot().code

    expect(store.verify('WRONG1', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(store.verify('WRONG2', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(store.verify('WRONG3', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS,
    })
    expect(store.snapshot().code).not.toBe(oldCode)

    const currentCode = store.snapshot().code
    expect(store.verify(currentCode, 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS,
    })
    expect(store.verify(currentCode, 'viewer-b')).toEqual({ ok: true })

    now += 60_000
    expect(store.verify(currentCode, 'viewer-a')).toEqual({ ok: true })
  })

  it('tracks failed attempts per viewer', () => {
    const store = new PairStore(() => 1000)

    expect(store.verify('WRONG1', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(store.verify('WRONG2', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(store.verify('WRONG1', 'viewer-b')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })

    expect(store.verify(store.snapshot().code, 'viewer-b')).toEqual({ ok: true })
    expect(store.verify('WRONG3', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS,
    })
  })

  it('resets a viewer attempts after successful verify', () => {
    const store = new PairStore(() => 1000)

    expect(store.verify('WRONG1', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(store.verify(store.snapshot().code, 'viewer-a')).toEqual({ ok: true })
    expect(store.verify('WRONG2', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(store.verify('WRONG3', 'viewer-a')).toEqual({
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
  })

  it('refreshes expired codes only when no viewer is locked', () => {
    let now = 1000
    const store = new PairStore(() => now)
    const firstCode = store.snapshot().code

    now += PAIR_CODE_TTL_MS - 1
    store.refreshIfExpired()
    expect(store.snapshot().code).toBe(firstCode)

    now += 1
    store.refreshIfExpired()
    expect(store.snapshot().code).not.toBe(firstCode)
  })

  it('reports current lock in snapshots and clears expired locks', () => {
    let now = 1000
    const store = new PairStore(() => now)

    store.verify('WRONG1', 'viewer-a')
    store.verify('WRONG2', 'viewer-a')
    store.verify('WRONG3', 'viewer-a')
    expect(store.snapshot().lockedUntil).toBe(61_000)

    now = 61_000
    expect(store.snapshot()).not.toHaveProperty('lockedUntil')
  })

  it('falls back to Node crypto when Web Crypto is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    })

    try {
      expect(generatePairCode()).toHaveLength(PAIR_CODE_LENGTH)
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, 'crypto')
      } else {
        Object.defineProperty(globalThis, 'crypto', descriptor)
      }
    }
  })
})
