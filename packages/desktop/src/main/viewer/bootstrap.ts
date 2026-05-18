import { type BrowserWindow } from 'electron'
import log from 'electron-log/main'
import type { SignalingTransport } from '@desk/signaling'
import { PROTOCOL_VERSION, parseSignalingMessage, type SignalingMessage } from '@desk/shared'

import { IpcChannels } from '../ipc/channels.js'
import { registerCleanup, registerHandler, sendViewerEvent } from '../ipc/registry.js'
import { EmbeddedClientTransport } from '../signaling/embedded-client.js'
import { MdnsBrowse } from './mdns-browse.js'
import type { ViewerPeerConnectionState } from '../../shared/api-types.js'

type BootstrapViewerOptions = {
  window: BrowserWindow
}

type ViewerTransport = SignalingTransport

export async function bootstrapViewerMain({ window }: BootstrapViewerOptions): Promise<void> {
  const mdns = new MdnsBrowse({
    onUp: (agent) => sendViewerEvent(window, { type: 'agent-discovered', ...agent }),
    onDown: (id) => sendViewerEvent(window, { type: 'agent-lost', id }),
  })
  let transport: ViewerTransport | undefined
  let unsubscribers: Array<() => void> = []
  const clientId = crypto.randomUUID()

  function setConnectionState(
    state: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed',
  ): void {
    sendViewerEvent(window, { type: 'connection-state', state })
  }

  async function stopTransport(nextState: 'idle' | 'disconnected' = 'idle'): Promise<void> {
    const active = transport
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe()
    }
    transport = undefined
    if (active !== undefined) {
      await active.stop()
    }
    setConnectionState(nextState)
  }

  registerHandler(IpcChannels.viewerDiscoverAgents, () => {
    mdns.start()
    return mdns.agents
  })
  registerHandler(IpcChannels.viewerConnect, async (_event, host, port, code) => {
    if (typeof host !== 'string' || typeof port !== 'number' || typeof code !== 'string') {
      throw new Error('Invalid viewer connect arguments')
    }

    await stopTransport('idle')
    setConnectionState('connecting')
    const nextTransport = new EmbeddedClientTransport({
      host,
      port,
      logger: { warn: (message) => log.warn(message) },
    })
    transport = nextTransport
    unsubscribers = [
      nextTransport.onMessage((message) => handleMessage(window, message, setConnectionState)),
      nextTransport.onConnectionState((state) => {
        if (state === 'closed') {
          setConnectionState('disconnected')
        }
        if (state === 'error') {
          setConnectionState('failed')
        }
      }),
    ]

    await nextTransport.start()
    nextTransport.send({ v: PROTOCOL_VERSION, t: 'hello', role: 'viewer', clientId })
    nextTransport.send({ v: PROTOCOL_VERSION, t: 'pair-request', code })
  })
  registerHandler(IpcChannels.viewerDisconnect, async () => {
    transport?.send({ v: PROTOCOL_VERSION, t: 'bye', reason: 'viewer-disconnect' })
    await stopTransport('disconnected')
  })
  registerHandler(IpcChannels.viewerSendSignal, (_event, rawMessage) => {
    const result = parseSignalingMessage(rawMessage)
    if (!result.ok) {
      log.warn('Dropped invalid viewer signaling message', result.error.message)
      return
    }
    transport?.send(result.value)
  })
  registerHandler(IpcChannels.viewerReportPeerConnectionState, (_event, state) => {
    if (!isViewerPeerConnectionState(state)) {
      throw new Error('Invalid viewer peer connection state')
    }

    if (state === 'connected') {
      setConnectionState('connected')
      return
    }

    setConnectionState(state === 'failed' ? 'failed' : 'disconnected')
  })

  registerCleanup(async () => {
    mdns.stop()
    await stopTransport('idle')
    log.info('Viewer main cleanup complete')
  })
}

function handleMessage(
  window: BrowserWindow,
  message: SignalingMessage,
  setConnectionState: (state: 'failed') => void,
): void {
  if (message.t === 'pair-result' && !message.ok) {
    setConnectionState('failed')
  }

  sendViewerEvent(window, { type: 'signaling-message', message })
}

function isViewerPeerConnectionState(value: unknown): value is ViewerPeerConnectionState {
  return (
    value === 'connected' || value === 'disconnected' || value === 'failed' || value === 'closed'
  )
}
