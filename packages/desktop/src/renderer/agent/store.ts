import { create } from 'zustand'

import type { AgentEvent, AgentStatus } from '../../shared/api-types.js'

type AgentUiState = {
  status: AgentStatus | undefined
  pairingCode: string
  expiresAt: number | undefined
  viewerId: string | undefined
  connectionState: 'pairing' | 'connecting' | 'active' | 'disconnecting' | 'unknown'
  setStatus(status: AgentStatus): void
  applyEvent(event: AgentEvent): void
}

export const useAgentStore = create<AgentUiState>((set) => ({
  status: undefined,
  pairingCode: '',
  expiresAt: undefined,
  viewerId: undefined,
  connectionState: 'unknown',
  setStatus(status) {
    set({
      status,
      pairingCode: status.session.phase === 'pairing' ? status.session.code : '',
      expiresAt: status.session.phase === 'pairing' ? status.session.expiresAt : undefined,
      viewerId: 'viewerId' in status.session ? status.session.viewerId : undefined,
      connectionState: status.session.phase,
    })
  },
  applyEvent(event) {
    switch (event.type) {
      case 'pairing-code':
        set({
          pairingCode: event.code,
          expiresAt: event.expiresAt,
          viewerId: undefined,
          connectionState: 'pairing',
        })
        break
      case 'session-state':
        set({
          pairingCode: event.state.phase === 'pairing' ? event.state.code : '',
          expiresAt: event.state.phase === 'pairing' ? event.state.expiresAt : undefined,
          viewerId: 'viewerId' in event.state ? event.state.viewerId : undefined,
          connectionState: event.state.phase,
        })
        break
      case 'viewer-connected':
        set({ viewerId: event.viewerId, connectionState: 'active' })
        break
      case 'viewer-disconnected':
        set({ viewerId: undefined, connectionState: 'pairing' })
        break
      case 'permission-changed':
      case 'signaling-message':
        break
    }
  },
}))
