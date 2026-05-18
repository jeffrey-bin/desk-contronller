import { app } from 'electron'

export function ensureSingleInstance(): boolean {
  const hasLock = app.requestSingleInstanceLock()

  if (!hasLock) {
    app.quit()
  }

  return hasLock
}
