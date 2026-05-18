import {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  PAIR_CODE_TTL_MS,
  PAIR_LOCKOUT_MS,
  PAIR_MAX_ATTEMPTS,
} from './constants.js'
import { ErrorCode } from './protocol/errors.js'

export interface PairSnapshot {
  code: string
  expiresAt: number
  attempts: number
  lockedUntil?: number
}

export type PairVerifyResult = { ok: true } | { ok: false; reason: ErrorCode }

type NowFn = () => number
type CryptoLike = {
  crypto?: {
    getRandomValues: (array: Uint8Array) => Uint8Array
  }
  process?: {
    getBuiltinModule?: (id: 'node:crypto') => {
      randomBytes: (length: number) => Uint8Array
    }
  }
}

export function generatePairCode(): string {
  const bytes = getRandomBytes(PAIR_CODE_LENGTH)
  let code = ''

  for (const byte of bytes) {
    code += PAIR_CODE_ALPHABET[byte % PAIR_CODE_ALPHABET.length]
  }

  return code
}

export function verifyPairCode(input: string, expected: string): boolean {
  if (input.length !== expected.length) {
    return false
  }

  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  }

  return diff === 0
}

export class PairStore {
  private current: { code: string; expiresAt: number }
  private readonly attempts = new Map<string, number>()
  private readonly locks = new Map<string, number>()
  private readonly now: NowFn

  constructor(now: NowFn = Date.now) {
    this.now = now
    this.current = this.createCurrent()
  }

  snapshot(): PairSnapshot {
    this.clearExpiredLocks()

    const lockedUntil = this.currentLockedUntil()
    const snapshot = {
      ...this.current,
      attempts: this.totalAttempts(),
    }

    if (lockedUntil === undefined) {
      return snapshot
    }

    return { ...snapshot, lockedUntil }
  }

  refreshIfExpired(): void {
    if (this.now() >= this.current.expiresAt && this.currentLockedUntil() === undefined) {
      this.rotate()
    }
  }

  verify(input: string, viewerId = 'default'): PairVerifyResult {
    const now = this.now()
    const lockedUntil = this.locks.get(viewerId)

    if (lockedUntil !== undefined) {
      if (now < lockedUntil) {
        return { ok: false, reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS }
      }
      this.locks.delete(viewerId)
    }

    if (now >= this.current.expiresAt) {
      this.rotate()
      return { ok: false, reason: ErrorCode.E_PAIR_EXPIRED }
    }

    if (verifyPairCode(input.toUpperCase(), this.current.code)) {
      this.attempts.delete(viewerId)
      return { ok: true }
    }

    const attempts = (this.attempts.get(viewerId) ?? 0) + 1
    this.attempts.set(viewerId, attempts)
    if (attempts >= PAIR_MAX_ATTEMPTS) {
      this.locks.set(viewerId, now + PAIR_LOCKOUT_MS)
      this.rotate()
      return { ok: false, reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS }
    }

    return { ok: false, reason: ErrorCode.E_PAIR_INVALID_CODE }
  }

  private createCurrent(): { code: string; expiresAt: number } {
    return {
      code: generatePairCode(),
      expiresAt: this.now() + PAIR_CODE_TTL_MS,
    }
  }

  private rotate(): void {
    this.current = this.createCurrent()
    this.attempts.clear()
  }

  private clearExpiredLocks(): void {
    const now = this.now()
    for (const [viewerId, lockedUntil] of this.locks) {
      if (now >= lockedUntil) {
        this.locks.delete(viewerId)
      }
    }
  }

  private currentLockedUntil(): number | undefined {
    this.clearExpiredLocks()

    let current: number | undefined
    for (const lockedUntil of this.locks.values()) {
      if (current === undefined || lockedUntil > current) {
        current = lockedUntil
      }
    }

    return current
  }

  private totalAttempts(): number {
    let total = 0
    for (const attempts of this.attempts.values()) {
      total += attempts
    }

    return total
  }
}

function getRandomBytes(length: number): Uint8Array {
  const global = globalThis as CryptoLike
  const crypto = global.crypto

  if (crypto?.getRandomValues !== undefined) {
    return crypto.getRandomValues(new Uint8Array(length))
  }

  const randomBytes = global.process?.getBuiltinModule?.('node:crypto').randomBytes
  if (randomBytes !== undefined) {
    return randomBytes(length)
  }

  throw new Error('Secure random number generator unavailable')
}
