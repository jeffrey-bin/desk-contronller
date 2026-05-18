import { describe, expect, it } from 'vitest'

import { ErrorCode, isErrorCode } from '../src/protocol/errors.js'

describe('ErrorCode', () => {
  it('exports exact protocol error codes', () => {
    expect(ErrorCode).toEqual({
      E_PAIR_INVALID_CODE: 'E_PAIR_INVALID_CODE',
      E_PAIR_EXPIRED: 'E_PAIR_EXPIRED',
      E_PAIR_TOO_MANY_ATTEMPTS: 'E_PAIR_TOO_MANY_ATTEMPTS',
      E_PEER_BUSY: 'E_PEER_BUSY',
      E_VERSION_MISMATCH: 'E_VERSION_MISMATCH',
      E_PERMISSION_SCREEN: 'E_PERMISSION_SCREEN',
      E_PERMISSION_A11Y: 'E_PERMISSION_A11Y',
      E_ICE_FAILED: 'E_ICE_FAILED',
      E_TRANSPORT_TIMEOUT: 'E_TRANSPORT_TIMEOUT',
    })
  })

  it('detects known error codes', () => {
    expect(isErrorCode(ErrorCode.E_PAIR_EXPIRED)).toBe(true)
    expect(isErrorCode('NOPE')).toBe(false)
  })
})
