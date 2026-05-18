import { useEffect, useRef } from 'react'

import { getAgentApi } from '../shared/api.js'
import { createAgentPeerController, type AgentPeerController } from './pc-controller.js'
import { AgentPeerSessionManager } from '../../shared/agent-peer-session.js'
import { capturePrimaryScreen, stopStream } from './capture.js'
import { StatusBadge } from './StatusBadge.js'
import { useAgentStore } from './store.js'

export function App(): JSX.Element {
  const api = getAgentApi()
  const { status, pairingCode, expiresAt, viewerId, connectionState, setStatus, applyEvent } =
    useAgentStore()
  const peerSessionRef = useRef<AgentPeerSessionManager<MediaStream, AgentPeerController>>()

  useEffect(() => {
    let mounted = true
    const peerSession = new AgentPeerSessionManager({
      capture: capturePrimaryScreen,
      createController: (stream: MediaStream) => createAgentPeerController(api, stream),
      stopStream,
      reportPeerConnectionState: (state) => api.reportPeerConnectionState(state),
    })
    peerSessionRef.current = peerSession

    void api.getStatus().then((nextStatus) => {
      if (mounted) {
        setStatus(nextStatus)
      }
    })

    const unsubscribe = api.onEvent((event) => {
      applyEvent(event)

      if (event.type === 'session-state' && event.state.phase === 'connecting') {
        void peerSession.start()
      }
      if (
        event.type === 'viewer-disconnected' ||
        (event.type === 'session-state' &&
          (event.state.phase === 'pairing' || event.state.phase === 'disconnecting'))
      ) {
        peerSession.stop()
      }
    })

    return () => {
      mounted = false
      unsubscribe()
      peerSession.stop()
      if (peerSessionRef.current === peerSession) {
        peerSessionRef.current = undefined
      }
    }
  }, [api, applyEvent, setStatus])

  const expiresLabel =
    expiresAt === undefined ? 'none' : new Date(expiresAt).toLocaleTimeString([], { hour12: false })
  const address =
    status === undefined ? 'starting' : `${status.signaling.host}:${status.signaling.port}`
  const permissions =
    status === undefined
      ? 'checking'
      : `screen ${formatBoolean(status.permissions.screen)} / accessibility ${formatBoolean(
          status.permissions.accessibility,
        )}`

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-6 py-6 text-slate-950">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Agent</p>
            <h1 className="mt-2 text-3xl font-semibold">Desk sharing</h1>
          </div>
          <StatusBadge state={connectionState} />
        </div>

        <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Pair code</p>
              <p className="mt-1 font-mono text-5xl font-semibold tracking-wider">
                {pairingCode || '------'}
              </p>
            </div>
            <button
              className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"
              disabled={pairingCode.length === 0}
              type="button"
              onClick={() => void navigator.clipboard.writeText(pairingCode)}
            >
              Copy
            </button>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Expires" value={expiresLabel} />
            <Info label="Address" value={address} />
            <Info label="Permissions" value={permissions} />
            <Info label="Viewer" value={viewerId ?? 'none'} />
          </dl>
        </div>

        <div className="flex justify-end">
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:text-slate-400"
            disabled={connectionState !== 'active' && connectionState !== 'connecting'}
            type="button"
            onClick={() => void api.stopSession()}
          >
            Disconnect
          </button>
        </div>
      </section>
    </main>
  )
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-900">{value}</dd>
    </div>
  )
}

function formatBoolean(value: boolean): string {
  return value ? 'granted' : 'missing'
}
