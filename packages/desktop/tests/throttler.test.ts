import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MODIFIER_SYNC_INTERVAL_MS, PROTOCOL_VERSION, encodeMods } from '@desk/shared'
import { isEditableKeyboardTarget } from '../src/renderer/viewer/editable-target.js'
import { createKeySyncState } from '../src/renderer/viewer/input-key-state.js'

describe('viewer input sender', () => {
  it('exposes pure throttler and guards mousemove by time and buffer', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/viewer/input-sender.ts'),
      'utf8',
    )

    expect(source).toContain('export function createMouseThrottler')
    expect(source).toContain('MOUSE_THROTTLE_MIN_INTERVAL_MS')
    expect(source).toContain('MOUSE_BUFFER_THRESHOLD_BYTES')
    expect(source).toContain('computeContentRect')
    expect(source).toContain('clamp01')
  })

  it('releases tracked keys even when meta shortcuts are active', () => {
    const state = createKeySyncState()

    state.keyDown('KeyA', {
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: true,
    })

    expect(state.isPressed('KeyA')).toBe(true)
    expect(state.releaseAll()).toEqual({ v: PROTOCOL_VERSION, t: 'rk' })
    expect(state.isPressed('KeyA')).toBe(false)
    expect(state.sync()).toEqual({ v: PROTOCOL_VERSION, t: 'sync', mods: 0, keys: [] })
  })

  it('wires lifecycle events to release-all and visibility sync', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/viewer/input-sender.ts'),
      'utf8',
    )

    expect(source).toContain('sendKey(keyState.releaseAll())')
    expect(source).toContain("window.addEventListener('blur'")
    expect(source).toContain("window.addEventListener('pagehide'")
    expect(source).toContain("document.addEventListener('visibilitychange'")
    expect(source).toContain('keyState.isPressed(key.code)')
    expect(source).toContain('MODIFIER_SYNC_INTERVAL_MS')
  })

  it('sends current modifier mask in periodic sync', () => {
    const state = createKeySyncState()
    state.keyDown('ShiftLeft', {
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    })

    expect(state.sync()).toEqual({
      v: PROTOCOL_VERSION,
      t: 'sync',
      mods: encodeMods({ shift: true, ctrl: false, alt: false, meta: false }),
      keys: ['ShiftLeft'],
    })
  })

  it('sends release-all on blur even when no keys were tracked', () => {
    expect(createKeySyncState().releaseAll()).toEqual({ v: PROTOCOL_VERSION, t: 'rk' })
    expect(MODIFIER_SYNC_INTERVAL_MS).toBe(1_000)
  })

  it('does not capture keyboard events from viewer form controls', () => {
    expect(isEditableKeyboardTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableKeyboardTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditableKeyboardTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableKeyboardTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isEditableKeyboardTarget({ tagName: 'VIDEO' })).toBe(false)
    expect(isEditableKeyboardTarget(null)).toBe(false)
  })
})
