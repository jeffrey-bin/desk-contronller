import { desktopCapturer, screen, type BrowserWindow } from 'electron'
import log from 'electron-log/main'
import { ErrorCode, parseKeyMsg, parseMouseMsg, parseSignalingMessage } from '@desk/shared'
import type { AgentPeerConnectionState } from '../../shared/api-types.js'

import { IpcChannels } from '../ipc/channels.js'
import { registerCleanup, registerHandler, sendAgentEvent } from '../ipc/registry.js'
import { makeHudWindow } from '../windows.js'
import { configureDisplayMediaRequestHandler } from './display-media.js'
import { checkAgentPermissions } from './permissions.js'
import { InputInjector } from './input-injector.js'
import { MdnsBroadcast } from './mdns-broadcast.js'
import { AgentSessionStateMachine } from './session-state.js'
import { AgentSignalingHost } from './signaling-host.js'

type BootstrapAgentOptions = {
  window: BrowserWindow
  host?: string
  port?: number
}

export async function bootstrapAgentMain({
  window,
  host = '0.0.0.0',
  port = 0,
}: BootstrapAgentOptions): Promise<void> {
  configureDisplayMediaRequestHandler(
    window.webContents.session,
    desktopCapturer,
    {
      warn: (message) => log.warn(message),
    },
    displayMediaOptionsFromEnv(process.env),
  )

  const session = new AgentSessionStateMachine()
  const input = new InputInjector()
  let hudWindow: BrowserWindow | undefined

  async function finishDisconnect(reason: string, viewerId?: string): Promise<void> {
    const disconnectedViewerId = viewerId ?? currentViewerId(session.state) ?? 'viewer'
    session.disconnect(reason)
    await input.releaseAll()
    session.cleanupComplete()
    const event = {
      type: 'viewer-disconnected',
      viewerId: disconnectedViewerId,
    } as const
    sendAgentEvent(window, { ...event, reason })
  }

  async function syncHud(): Promise<void> {
    if (session.state.phase === 'active') {
      if (hudWindow === undefined || hudWindow.isDestroyed()) {
        hudWindow = await makeHudWindow()
      }
      return
    }

    hudWindow?.close()
    hudWindow = undefined
  }

  const signaling = new AgentSignalingHost({
    session,
    host,
    port,
    callbacks: {
      onPairAccepted: () => undefined,
      onAnswer: (message) => {
        sendAgentEvent(window, { type: 'signaling-message', message })
      },
      onIce: (message) => {
        sendAgentEvent(window, { type: 'signaling-message', message })
      },
      onBye: (message) => {
        void finishDisconnect(message.reason ?? 'peer-bye')
      },
      onConnectionLost: (viewerId, state) => {
        void finishDisconnect(
          state === 'error' ? ErrorCode.E_TRANSPORT_TIMEOUT : 'transport-closed',
          viewerId,
        )
      },
    },
  })
  const mdns = new MdnsBroadcast()

  session.onStateChange((state) => {
    sendAgentEvent(window, { type: 'session-state', state })
    if (state.phase === 'pairing') {
      sendAgentEvent(window, { type: 'pairing-code', code: state.code, expiresAt: state.expiresAt })
    }
    if (state.phase === 'active') {
      sendAgentEvent(window, { type: 'viewer-connected', viewerId: state.viewerId })
    }
    void syncHud()
  })

  await signaling.start()
  await mdns.start({ port: signaling.port })

  registerHandler(IpcChannels.agentCheckPermissions, () => checkAgentPermissions())
  registerHandler(IpcChannels.agentGetStatus, async () => ({
    permissions: await checkAgentPermissions(),
    session: session.state,
    signaling: signaling.address,
  }))
  registerHandler(IpcChannels.agentStartSession, () => session.state)
  registerHandler(IpcChannels.agentStopSession, async () => {
    session.disconnect('user-stop')
    await input.releaseAll()
    session.cleanupComplete()
    return session.state
  })
  registerHandler(IpcChannels.agentSendMouse, async (_event, rawMessage) => {
    const result = parseMouseMsg(rawMessage)
    if (!result.ok) {
      log.warn('Dropped invalid mouse message from renderer', result.error.message)
      return
    }

    await input.handleMouse(result.value, screen.getPrimaryDisplay().size)
  })
  registerHandler(IpcChannels.agentSendKey, async (_event, rawMessage) => {
    const result = parseKeyMsg(rawMessage)
    if (!result.ok) {
      log.warn('Dropped invalid key message from renderer', result.error.message)
      return
    }

    await input.handleKey(result.value)
  })
  registerHandler(IpcChannels.agentSendSignal, (_event, rawMessage) => {
    const result = parseSignalingMessage(rawMessage)
    if (!result.ok) {
      log.warn('Dropped invalid signaling message from renderer', result.error.message)
      return
    }

    signaling.send(result.value)
  })
  registerHandler(IpcChannels.agentReportPeerConnectionState, async (_event, state) => {
    if (!isAgentPeerConnectionState(state)) {
      throw new Error('Invalid peer connection state')
    }

    if (state === 'connected') {
      session.peerConnected()
      return session.state
    }

    await finishDisconnect(
      state === 'failed' ? ErrorCode.E_ICE_FAILED : ErrorCode.E_TRANSPORT_TIMEOUT,
    )
    return session.state
  })

  registerCleanup(async () => {
    hudWindow?.close()
    hudWindow = undefined
    await input.releaseAll()
    await mdns.stop()
    await signaling.stop()
    log.info('Agent main cleanup complete')
  })

  const state = session.state
  if (state.phase === 'pairing') {
    sendAgentEvent(window, { type: 'session-state', state })
    sendAgentEvent(window, { type: 'pairing-code', code: state.code, expiresAt: state.expiresAt })
  }
}

function displayMediaOptionsFromEnv(
  env: Record<string, string | undefined>,
): Parameters<typeof configureDisplayMediaRequestHandler>[3] {
  const fallbackSourceId = env.DESK_DISPLAY_MEDIA_FALLBACK_SOURCE

  if (fallbackSourceId === undefined || fallbackSourceId.length === 0) {
    return {}
  }

  return {
    fallbackSource: {
      id: fallbackSourceId,
      name: 'Entire Screen',
    },
  }
}

function isAgentPeerConnectionState(value: unknown): value is AgentPeerConnectionState {
  return (
    value === 'connected' || value === 'disconnected' || value === 'failed' || value === 'closed'
  )
}

function currentViewerId(state: AgentSessionStateMachine['state']): string | undefined {
  return 'viewerId' in state ? state.viewerId : undefined
}
