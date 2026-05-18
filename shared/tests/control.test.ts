import { describe, expect, it } from 'vitest'

import {
  Mods,
  decodeMods,
  encodeMods,
  parseKeyMsg,
  parseMouseMsg,
} from '../src/protocol/control.js'
import { PROTOCOL_VERSION } from '../src/constants.js'

describe('control protocol', () => {
  it('accepts mouse messages', () => {
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mm', x: 0.5, y: 0.25 }).ok).toBe(true)
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'md', x: 1, y: 0, b: 0 }).ok).toBe(true)
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mu', x: 0, y: 1, b: 2 }).ok).toBe(true)
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mw', x: 1, y: 1, dx: -1, dy: 3 }).ok).toBe(true)
  })

  it('requires protocol version on control messages', () => {
    expect(parseMouseMsg({ t: 'mm', x: 0.5, y: 0.25 }).ok).toBe(false)
    expect(parseMouseMsg({ v: 2, t: 'mm', x: 0.5, y: 0.25 }).ok).toBe(false)
    expect(parseKeyMsg({ t: 'rk' }).ok).toBe(false)
    expect(parseKeyMsg({ v: 2, t: 'rk' }).ok).toBe(false)
  })

  it('rejects invalid mouse buttons', () => {
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'md', x: 1, y: 0.5, b: 5 }).ok).toBe(false)
  })

  it('rejects out of range and non-finite coordinates', () => {
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mm', x: -0.1, y: 0.5 }).ok).toBe(false)
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mm', x: 0.5, y: 1.1 }).ok).toBe(false)
    expect(parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mm', x: Number.NaN, y: 0.5 }).ok).toBe(false)
    expect(
      parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mm', x: Number.POSITIVE_INFINITY, y: 0.5 }).ok,
    ).toBe(false)
  })

  it('rejects non-finite wheel deltas', () => {
    expect(
      parseMouseMsg({
        v: PROTOCOL_VERSION,
        t: 'mw',
        x: 0.5,
        y: 0.5,
        dx: Number.POSITIVE_INFINITY,
        dy: 0,
      }).ok,
    ).toBe(false)
    expect(
      parseMouseMsg({ v: PROTOCOL_VERSION, t: 'mw', x: 0.5, y: 0.5, dx: 0, dy: Number.NaN }).ok,
    ).toBe(false)
  })

  it('accepts key messages', () => {
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'kd', code: 'KeyA', mods: Mods.Shift }).ok).toBe(
      true,
    )
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'ku', code: 'KeyA', mods: Mods.Ctrl }).ok).toBe(
      true,
    )
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'sync', mods: Mods.Alt, keys: ['KeyA'] }).ok).toBe(
      true,
    )
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'rk' }).ok).toBe(true)
  })

  it('rejects empty key codes for down/up', () => {
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'kd', code: '', mods: 0 }).ok).toBe(false)
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'ku', code: '', mods: 0 }).ok).toBe(false)
  })

  it('rejects invalid modifier masks', () => {
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'kd', code: 'KeyA', mods: -1 }).ok).toBe(false)
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'ku', code: 'KeyA', mods: 16 }).ok).toBe(false)
    expect(parseKeyMsg({ v: PROTOCOL_VERSION, t: 'sync', mods: 1.5, keys: [] }).ok).toBe(false)
    expect(
      parseKeyMsg({ v: PROTOCOL_VERSION, t: 'sync', mods: Number.POSITIVE_INFINITY, keys: [] }).ok,
    ).toBe(false)
  })

  it('encodes and decodes modifier masks', () => {
    const mask = encodeMods({ shift: true, ctrl: true, alt: true, meta: true })

    expect(mask).toBe(Mods.Shift | Mods.Ctrl | Mods.Alt | Mods.Meta)
    expect(decodeMods(mask)).toEqual({ shift: true, ctrl: true, alt: true, meta: true })
  })
})
