type WindowWithClosedEvent = {
  on(event: 'closed', listener: () => void): void
}

export type WindowState<TWindow extends WindowWithClosedEvent> = {
  current: TWindow | undefined
}

export function trackCurrentWindow<TWindow extends WindowWithClosedEvent>(
  state: WindowState<TWindow>,
  window: TWindow,
  onCurrentClosed?: () => void,
): void {
  state.current = window

  window.on('closed', () => {
    if (state.current === window) {
      onCurrentClosed?.()
      state.current = undefined
    }
  })
}
