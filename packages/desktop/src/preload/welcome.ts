import { contextBridge, ipcRenderer } from 'electron'

import type { WelcomeApi } from '../shared/api-types.js'
import type { IpcChannels as AuthoritativeIpcChannels } from '../shared/ipc-channels.js'

type WelcomeIpcChannels = Pick<typeof AuthoritativeIpcChannels, 'welcomePickMode'>

const IpcChannels = {
  welcomePickMode: 'welcome:pick-mode',
} satisfies WelcomeIpcChannels

const api: WelcomeApi = {
  pickMode: (mode) => ipcRenderer.invoke(IpcChannels.welcomePickMode, mode),
}

contextBridge.exposeInMainWorld('api', api)
