import { describe, expect, it } from 'vitest'

import { trackCurrentWindow, type WindowState } from '../src/main/window-state.js'

type ClosedListener = () => void

class FakeWindow {
  private closedListener: ClosedListener | undefined

  on(event: 'closed', listener: ClosedListener): void {
    expect(event).toBe('closed')
    this.closedListener = listener
  }

  close(): void {
    this.closedListener?.()
  }
}

describe('trackCurrentWindow', () => {
  it('ignores stale closed events from replaced windows', () => {
    const state: WindowState<FakeWindow> = { current: undefined }
    const oldWindow = new FakeWindow()
    const newWindow = new FakeWindow()

    trackCurrentWindow(state, oldWindow)
    trackCurrentWindow(state, newWindow)

    oldWindow.close()

    expect(state.current).toBe(newWindow)
  })

  it('clears the current window when it closes', () => {
    const state: WindowState<FakeWindow> = { current: undefined }
    const window = new FakeWindow()

    trackCurrentWindow(state, window)
    window.close()

    expect(state.current).toBeUndefined()
  })

  it('runs current-window cleanup before clearing closed window', () => {
    const state: WindowState<FakeWindow> = { current: undefined }
    const window = new FakeWindow()
    const events: string[] = []

    trackCurrentWindow(state, window, () => {
      events.push(state.current === window ? 'cleanup-before-clear' : 'cleanup-after-clear')
    })
    window.close()

    expect(events).toEqual(['cleanup-before-clear'])
    expect(state.current).toBeUndefined()
  })
})
