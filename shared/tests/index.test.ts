import { describe, expect, it } from 'vitest'

import * as shared from '../src/index.js'

describe('public index', () => {
  it('re-exports shared package modules', () => {
    expect(shared.PROTOCOL_VERSION).toBe(1)
    expect(shared.ErrorCode.E_ICE_FAILED).toBe('E_ICE_FAILED')
    expect(shared.Mods.Meta).toBe(8)
    expect(shared.computeContentRect(1, 1, 1, 1)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(shared.generatePairCode()).toHaveLength(shared.PAIR_CODE_LENGTH)
  })
})
