import {
  MODIFIER_SYNC_INTERVAL_MS,
  MOUSE_BUFFER_THRESHOLD_BYTES,
  MOUSE_THROTTLE_MIN_INTERVAL_MS,
  PROTOCOL_VERSION,
  clamp01,
  computeContentRect,
  type KeyMsg,
  type MouseMsg,
} from '@desk/shared'

import { createKeySyncState } from './input-key-state.js'
import { isEditableKeyboardTarget } from './editable-target.js'

type SenderChannel = {
  bufferedAmount: number
  readyState: string
  send(data: string): void
}

export type MouseMoveInput = {
  clientX: number
  clientY: number
  elementLeft: number
  elementTop: number
  elementWidth: number
  elementHeight: number
  videoWidth: number
  videoHeight: number
  bufferedAmount: number
}

export function createMouseThrottler(options: {
  now?: () => number
  send: (message: MouseMsg) => void
}): { move(input: MouseMoveInput): void } {
  const now = options.now ?? performance.now.bind(performance)
  let lastSentAt = -Infinity

  return {
    move(input) {
      if (input.bufferedAmount > MOUSE_BUFFER_THRESHOLD_BYTES) {
        return
      }
      const at = now()
      if (at - lastSentAt < MOUSE_THROTTLE_MIN_INTERVAL_MS) {
        return
      }
      lastSentAt = at
      options.send({ v: PROTOCOL_VERSION, t: 'mm', ...normalizedPoint(input) })
    },
  }
}

export type InputSender = {
  attach(video: VideoLike): () => void
}

type VideoLike = {
  videoWidth: number
  videoHeight: number
  getBoundingClientRect(): { left: number; top: number; width: number; height: number }
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
  focus?: () => void
}

export function createInputSender(channels: {
  mouse?: SenderChannel
  keyboard?: SenderChannel
}): InputSender {
  const keyState = createKeySyncState()
  const sendMouse = (message: MouseMsg): void => send(channels.mouse, message)
  const sendKey = (message: KeyMsg): void => send(channels.keyboard, message)
  const throttler = createMouseThrottler({ send: sendMouse })
  const releaseAll = (): void => {
    sendKey(keyState.releaseAll())
  }
  const syncKeys = (): void => {
    sendKey(keyState.sync())
  }

  return {
    attach(video) {
      const onMouseMove = (event: Event): void => {
        const mouse = event as MouseEvent
        const rect = video.getBoundingClientRect()
        throttler.move({
          clientX: mouse.clientX,
          clientY: mouse.clientY,
          elementLeft: rect.left,
          elementTop: rect.top,
          elementWidth: rect.width,
          elementHeight: rect.height,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          bufferedAmount: channels.mouse?.bufferedAmount ?? 0,
        })
      }
      const onMouseDown = (event: Event): void => {
        const mouse = event as MouseEvent
        video.focus?.()
        sendMouse({
          v: PROTOCOL_VERSION,
          t: 'md',
          ...pointFromMouse(mouse, video),
          b: button(mouse.button),
        })
      }
      const onMouseUp = (event: Event): void => {
        const mouse = event as MouseEvent
        sendMouse({
          v: PROTOCOL_VERSION,
          t: 'mu',
          ...pointFromMouse(mouse, video),
          b: button(mouse.button),
        })
      }
      const onWheel = (event: Event): void => {
        const wheel = event as WheelEvent
        wheel.preventDefault()
        sendMouse({
          v: PROTOCOL_VERSION,
          t: 'mw',
          ...pointFromMouse(wheel, video),
          dx: wheel.deltaX,
          dy: wheel.deltaY,
        })
      }
      const onKeyDown = (event: Event): void => {
        const key = event as KeyboardEvent
        if (isEditableKeyboardTarget(key.target)) {
          return
        }
        if (isSystemShortcut(key) && !isModifierKey(key.code)) {
          return
        }
        key.preventDefault()
        sendKey(keyState.keyDown(key.code, key))
      }
      const onKeyUp = (event: Event): void => {
        const key = event as KeyboardEvent
        if (isEditableKeyboardTarget(key.target) && !keyState.isPressed(key.code)) {
          return
        }
        if (isSystemShortcut(key) && !keyState.isPressed(key.code) && !isModifierKey(key.code)) {
          return
        }
        key.preventDefault()
        sendKey(keyState.keyUp(key.code, key))
      }
      const onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') {
          releaseAll()
        }
      }
      const syncInterval = window.setInterval(syncKeys, MODIFIER_SYNC_INTERVAL_MS)

      video.addEventListener('mousemove', onMouseMove)
      video.addEventListener('mousedown', onMouseDown)
      video.addEventListener('mouseup', onMouseUp)
      video.addEventListener('wheel', onWheel)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', releaseAll)
      window.addEventListener('pagehide', releaseAll)
      document.addEventListener('visibilitychange', onVisibilityChange)

      return () => {
        releaseAll()
        window.clearInterval(syncInterval)
        video.removeEventListener('mousemove', onMouseMove)
        video.removeEventListener('mousedown', onMouseDown)
        video.removeEventListener('mouseup', onMouseUp)
        video.removeEventListener('wheel', onWheel)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', releaseAll)
        window.removeEventListener('pagehide', releaseAll)
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    },
  }
}

function pointFromMouse(
  event: Pick<MouseEvent, 'clientX' | 'clientY'>,
  video: VideoLike,
): { x: number; y: number } {
  const rect = video.getBoundingClientRect()
  return normalizedPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    elementLeft: rect.left,
    elementTop: rect.top,
    elementWidth: rect.width,
    elementHeight: rect.height,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    bufferedAmount: 0,
  })
}

function normalizedPoint(input: MouseMoveInput): { x: number; y: number } {
  const content = computeContentRect(
    input.elementWidth,
    input.elementHeight,
    input.videoWidth,
    input.videoHeight,
  )
  if (content.w <= 0 || content.h <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: clamp01((input.clientX - input.elementLeft - content.x) / content.w),
    y: clamp01((input.clientY - input.elementTop - content.y) / content.h),
  }
}

function send(channel: SenderChannel | undefined, message: MouseMsg | KeyMsg): void {
  if (channel?.readyState === 'open') {
    channel.send(JSON.stringify(message))
  }
}

function button(value: number): 0 | 1 | 2 {
  return value === 1 || value === 2 ? value : 0
}

function isSystemShortcut(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  return event.metaKey || (event.ctrlKey && event.altKey)
}

function isModifierKey(code: string): boolean {
  return (
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'AltLeft' ||
    code === 'AltRight' ||
    code === 'MetaLeft' ||
    code === 'MetaRight'
  )
}
