import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

import { IpcChannels } from './channels.js'
import type { AgentEvent, ViewerEvent } from '../../shared/api-types.js'

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
type Cleanup = () => void | Promise<void>

const cleanups: Cleanup[] = []
const activeHandlers = new Map<string, symbol>()

export function registerHandler(channel: string, handler: IpcHandler): void {
  const token = Symbol(channel)
  activeHandlers.set(channel, token)
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
  cleanups.push(() => {
    if (activeHandlers.get(channel) === token) {
      activeHandlers.delete(channel)
      ipcMain.removeHandler(channel)
    }
  })
}

export function registerCleanup(cleanup: Cleanup): void {
  cleanups.push(cleanup)
}

export async function runCleanups(): Promise<void> {
  const pending = cleanups.splice(0).reverse()

  for (const cleanup of pending) {
    await cleanup()
  }
}

export function sendAgentEvent(window: BrowserWindow, event: AgentEvent): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IpcChannels.agentEvents, event)
  }
}

export function sendViewerEvent(window: BrowserWindow, event: ViewerEvent): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IpcChannels.viewerEvents, event)
  }
}
