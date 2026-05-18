import type { KeyMsg, MouseMsg, SignalingMessage } from '@desk/shared'

export { IpcChannels } from './ipc-channels.js'

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt'

export type AgentPermissionState = {
  screen: boolean
  accessibility: boolean
}

export type AgentSessionState =
  | { phase: 'pairing'; code: string; expiresAt: number; attempts: number }
  | { phase: 'connecting'; viewerId: string }
  | { phase: 'active'; viewerId: string; since: number }
  | { phase: 'disconnecting'; reason: string }

export type AgentStatus = {
  permissions: AgentPermissionState
  session: AgentSessionState
  signaling: { host: string; port: number }
}

export type AgentEvent =
  | { type: 'permission-changed'; screen: PermissionStatus; accessibility: PermissionStatus }
  | { type: 'session-state'; state: AgentSessionState }
  | { type: 'pairing-code'; code: string; expiresAt: number }
  | { type: 'viewer-connected'; viewerId: string }
  | { type: 'viewer-disconnected'; viewerId: string; reason?: string }
  | { type: 'signaling-message'; message: SignalingMessage }

export type AgentPeerConnectionState = 'connected' | 'disconnected' | 'failed' | 'closed'
export type ViewerPeerConnectionState = AgentPeerConnectionState

export type DiscoveredAgent = {
  id: string
  name: string
  host: string
  port: number
  txt: Record<string, string>
  lastSeen: number
}

export type ViewerEvent =
  | ({ type: 'agent-discovered' } & DiscoveredAgent)
  | { type: 'agent-lost'; id: string }
  | { type: 'signaling-message'; message: SignalingMessage }
  | {
      type: 'connection-state'
      state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'
    }

export type AgentApi = {
  checkPermissions(): Promise<AgentPermissionState>
  getStatus(): Promise<AgentStatus>
  startSession(): Promise<AgentSessionState>
  stopSession(): Promise<AgentSessionState>
  sendMouse(message: MouseMsg): Promise<void>
  sendKey(message: KeyMsg): Promise<void>
  sendSignal(message: SignalingMessage): Promise<void>
  reportPeerConnectionState(state: AgentPeerConnectionState): Promise<AgentSessionState>
  onEvent(listener: (event: AgentEvent) => void): () => void
}

export type ViewerApi = {
  discoverAgents(): Promise<DiscoveredAgent[]>
  connect(host: string, port: number, code: string): Promise<void>
  disconnect(): Promise<void>
  sendSignal(message: SignalingMessage): Promise<void>
  reportPeerConnectionState(state: ViewerPeerConnectionState): Promise<void>
  onEvent(listener: (event: ViewerEvent) => void): () => void
}

export type WelcomeApi = {
  pickMode(mode: 'agent' | 'viewer'): Promise<void>
}
