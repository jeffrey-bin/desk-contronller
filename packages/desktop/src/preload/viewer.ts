import { contextBridge, ipcRenderer } from 'electron'

import type { ViewerApi, ViewerEvent } from '../shared/api-types.js'
import type { IpcChannels as AuthoritativeIpcChannels } from '../shared/ipc-channels.js'

type ViewerIpcChannels = Pick<
  typeof AuthoritativeIpcChannels,
  | 'viewerDiscoverAgents'
  | 'viewerConnect'
  | 'viewerDisconnect'
  | 'viewerSendSignal'
  | 'viewerReportPeerConnectionState'
  | 'viewerEvents'
>

const IpcChannels = {
  viewerDiscoverAgents: 'viewer:discover-agents',
  viewerConnect: 'viewer:connect',
  viewerDisconnect: 'viewer:disconnect',
  viewerSendSignal: 'viewer:send-signal',
  viewerReportPeerConnectionState: 'viewer:report-peer-connection-state',
  viewerEvents: 'viewer:events',
} satisfies ViewerIpcChannels

const api: ViewerApi = {
  discoverAgents: () => ipcRenderer.invoke(IpcChannels.viewerDiscoverAgents),
  connect: (host, port, code) => ipcRenderer.invoke(IpcChannels.viewerConnect, host, port, code),
  disconnect: () => ipcRenderer.invoke(IpcChannels.viewerDisconnect),
  sendSignal: (message) => ipcRenderer.invoke(IpcChannels.viewerSendSignal, message),
  reportPeerConnectionState: (state) =>
    ipcRenderer.invoke(IpcChannels.viewerReportPeerConnectionState, state),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ViewerEvent): void =>
      listener(payload)

    ipcRenderer.on(IpcChannels.viewerEvents, handler)

    return () => ipcRenderer.off(IpcChannels.viewerEvents, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
