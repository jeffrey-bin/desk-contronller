import { contextBridge, ipcRenderer } from 'electron'

import type { AgentApi, AgentEvent } from '../shared/api-types.js'
import type { IpcChannels as AuthoritativeIpcChannels } from '../shared/ipc-channels.js'

type AgentIpcChannels = Pick<
  typeof AuthoritativeIpcChannels,
  | 'agentCheckPermissions'
  | 'agentGetStatus'
  | 'agentStartSession'
  | 'agentStopSession'
  | 'agentSendMouse'
  | 'agentSendKey'
  | 'agentSendSignal'
  | 'agentReportPeerConnectionState'
  | 'agentEvents'
>

const IpcChannels = {
  agentCheckPermissions: 'agent:check-permissions',
  agentGetStatus: 'agent:get-status',
  agentStartSession: 'agent:start-session',
  agentStopSession: 'agent:stop-session',
  agentSendMouse: 'agent:send-mouse',
  agentSendKey: 'agent:send-key',
  agentSendSignal: 'agent:send-signal',
  agentReportPeerConnectionState: 'agent:report-peer-connection-state',
  agentEvents: 'agent:events',
} satisfies AgentIpcChannels

const api: AgentApi = {
  checkPermissions: () => ipcRenderer.invoke(IpcChannels.agentCheckPermissions),
  getStatus: () => ipcRenderer.invoke(IpcChannels.agentGetStatus),
  startSession: () => ipcRenderer.invoke(IpcChannels.agentStartSession),
  stopSession: () => ipcRenderer.invoke(IpcChannels.agentStopSession),
  sendMouse: (message) => ipcRenderer.invoke(IpcChannels.agentSendMouse, message),
  sendKey: (message) => ipcRenderer.invoke(IpcChannels.agentSendKey, message),
  sendSignal: (message) => ipcRenderer.invoke(IpcChannels.agentSendSignal, message),
  reportPeerConnectionState: (state) =>
    ipcRenderer.invoke(IpcChannels.agentReportPeerConnectionState, state),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent): void =>
      listener(payload)

    ipcRenderer.on(IpcChannels.agentEvents, handler)

    return () => ipcRenderer.off(IpcChannels.agentEvents, handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
