import { create } from 'zustand'

import type { DiscoveredAgent, ViewerEvent } from '../../shared/api-types.js'
import type { ViewerStats } from '../shared/webrtc/stats.js'

type ViewerConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'

type ViewerUiState = {
  agents: DiscoveredAgent[]
  selected: DiscoveredAgent | undefined
  connectionState: ViewerConnectionState
  error: string
  stream: MediaStream | undefined
  stats: ViewerStats
  setAgents(agents: DiscoveredAgent[]): void
  selectAgent(agent: DiscoveredAgent): void
  setStream(stream: MediaStream | undefined): void
  setStats(stats: ViewerStats): void
  setError(error: string): void
  applyEvent(event: ViewerEvent): void
}

export const useViewerStore = create<ViewerUiState>((set) => ({
  agents: [],
  selected: undefined,
  connectionState: 'idle',
  error: '',
  stream: undefined,
  stats: {},
  setAgents(agents) {
    set({ agents })
  },
  selectAgent(agent) {
    set({ selected: agent, error: '' })
  },
  setStream(stream) {
    set({ stream })
  },
  setStats(stats) {
    set({ stats })
  },
  setError(error) {
    set({ error })
  },
  applyEvent(event) {
    switch (event.type) {
      case 'agent-discovered':
        set((state) => ({
          agents: upsertAgent(state.agents, event),
          selected: state.selected?.id === event.id ? event : state.selected,
        }))
        break
      case 'agent-lost':
        set((state) => ({
          agents: state.agents.filter((agent) => agent.id !== event.id),
          selected: state.selected?.id === event.id ? undefined : state.selected,
        }))
        break
      case 'connection-state':
        set({
          connectionState: event.state,
          error: event.state === 'failed' ? 'Connection failed' : '',
        })
        break
      case 'signaling-message':
        if (event.message.t === 'pair-result' && !event.message.ok) {
          set({ error: event.message.reason ?? 'Pairing failed' })
        }
        break
    }
  },
}))

function upsertAgent(agents: DiscoveredAgent[], agent: DiscoveredAgent): DiscoveredAgent[] {
  const rest = agents.filter((item) => item.id !== agent.id)
  return [...rest, agent].sort((a, b) => a.name.localeCompare(b.name))
}
