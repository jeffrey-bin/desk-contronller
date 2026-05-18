import { describe, expect, it } from 'vitest'

import {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  PAIR_CODE_TTL_MS,
  PAIR_LOCKOUT_MS,
  PAIR_MAX_ATTEMPTS,
  PROTOCOL_VERSION,
  VIDEO_MAX_BITRATE_BPS,
  VIDEO_RN_ANDROID_SCALE_DOWN_BY,
} from '../src/constants.js'

describe('constants', () => {
  it('uses protocol version 1', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })

  it('defines unambiguous pair code format', () => {
    expect(PAIR_CODE_LENGTH).toBe(6)
    expect(PAIR_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
    expect(PAIR_CODE_ALPHABET).not.toMatch(/[IO01]/)
  })

  it('defines pairing limits', () => {
    expect(PAIR_CODE_TTL_MS).toBe(5 * 60_000)
    expect(PAIR_MAX_ATTEMPTS).toBe(3)
    expect(PAIR_LOCKOUT_MS).toBe(60_000)
  })

  it('defines the max video bitrate', () => {
    expect(VIDEO_MAX_BITRATE_BPS).toBe(8_000_000)
  })

  it('defines Android RN video scale down', () => {
    expect(VIDEO_RN_ANDROID_SCALE_DOWN_BY).toBe(2)
  })
})
