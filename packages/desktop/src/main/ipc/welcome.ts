import type Store from 'electron-store'
import type { AppMode } from '../mode.js'
import { IpcChannels } from './channels.js'
import { registerHandler } from './registry.js'

type DesktopStore = {
  mode?: Exclude<AppMode, 'welcome'>
}

type RegisterWelcomeIpcOptions = {
  store: Store<DesktopStore>
  switchMode(mode: Exclude<AppMode, 'welcome'>): Promise<void>
}

function isSelectableMode(value: unknown): value is Exclude<AppMode, 'welcome'> {
  return value === 'agent' || value === 'viewer'
}

export function registerWelcomeIpc({ store, switchMode }: RegisterWelcomeIpcOptions): void {
  registerHandler(IpcChannels.welcomePickMode, async (_event, mode) => {
    if (!isSelectableMode(mode)) {
      throw new Error('Invalid app mode')
    }

    await switchMode(mode)
    store.set('mode', mode)
  })
}
