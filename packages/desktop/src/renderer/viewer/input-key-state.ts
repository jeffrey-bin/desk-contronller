import { PROTOCOL_VERSION, encodeMods, type KeyMsg } from '@desk/shared'

export type KeyModifierState = {
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

export type KeySyncState = {
  isPressed(code: string): boolean
  keyDown(code: string, modifiers: KeyModifierState): KeyMsg
  keyUp(code: string, modifiers: KeyModifierState): KeyMsg
  sync(): KeyMsg
  releaseAll(): KeyMsg
}

export function createKeySyncState(): KeySyncState {
  const pressedKeys = new Set<string>()
  let currentMods = 0

  return {
    isPressed(code) {
      return pressedKeys.has(code)
    },
    keyDown(code, modifiers) {
      currentMods = mods(modifiers)
      pressedKeys.add(code)
      return { v: PROTOCOL_VERSION, t: 'kd', code, mods: currentMods }
    },
    keyUp(code, modifiers) {
      currentMods = mods(modifiers)
      pressedKeys.delete(code)
      return { v: PROTOCOL_VERSION, t: 'ku', code, mods: currentMods }
    },
    sync() {
      return { v: PROTOCOL_VERSION, t: 'sync', mods: currentMods, keys: [...pressedKeys] }
    },
    releaseAll() {
      pressedKeys.clear()
      currentMods = 0
      return { v: PROTOCOL_VERSION, t: 'rk' }
    },
  }
}

function mods(event: KeyModifierState): number {
  return encodeMods({
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
  })
}
