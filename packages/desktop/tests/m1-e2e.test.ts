/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { ErrorCode, PROTOCOL_VERSION, type SignalingMessage } from '@desk/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentSignalingHost } from '../src/main/agent/signaling-host.js'
import { AgentSessionStateMachine } from '../src/main/agent/session-state.js'
import { InputInjector } from '../src/main/agent/input-injector.js'
import { EmbeddedClientTransport } from '../src/main/signaling/embedded-client.js'
import { AgentPeerSessionManager } from '../src/shared/agent-peer-session.js'
import type {
  AgentApi,
  AgentEvent,
  AgentPeerConnectionState,
  AgentSessionState,
  AgentStatus,
  DiscoveredAgent,
  ViewerApi,
  ViewerEvent,
  ViewerPeerConnectionState,
} from '../src/shared/api-types.js'
import {
  createAgentPeerController,
  type AgentPeerController,
} from '../src/renderer/agent/pc-controller.js'
import { createViewerPeerController } from '../src/renderer/viewer/pc-controller.js'
import { createInputSender } from '../src/renderer/viewer/input-sender.js'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'
type Cleanup = () => Promise<void> | void

const displaySize = { width: 2_000, height: 1_000 }

let browserRuntime: BrowserRuntime | undefined
let cleanups: Cleanup[] = []

beforeEach(() => {
  browserRuntime = installBrowserRuntime()
  cleanups = []
})

afterEach(async () => {
  const errors: unknown[] = []
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup()
    } catch (error) {
      errors.push(error)
    }
  }
  try {
    browserRuntime?.cleanup()
  } finally {
    browserRuntime = undefined
    vi.restoreAllMocks()
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'M1 E2E cleanup failed')
  }
})

describe('M1 automated E2E main chain', () => {
  it('discovers, pairs, receives stream, forwards input, and disconnects cleanly', async () => {
    const agent = track(new AgentRuntime())
    await agent.start()
    const viewer = track(new ViewerRuntime(() => [agent.discoveredAgent]))
    const streamSink = new StreamSink()
    const viewerController = track(
      await createViewerPeerController({
        api: viewer.api,
        onStream: (stream) => streamSink.set(stream),
        onStats: () => undefined,
      }),
    )
    const video = new FakeVideo()
    const detachInput = createInputSender(viewerController.inputChannels()).attach(video)
    cleanups.push(detachInput)

    await expect
      .poll(
        async () =>
          (await viewer.api.discoverAgents()).map((discovered) => ({
            host: discovered.host,
            port: discovered.port,
            version: discovered.txt.v,
          })),
        { timeout: 5_000 },
      )
      .toEqual([{ host: '127.0.0.1', port: agent.discoveredAgent.port, version: '1' }])

    await viewer.api.connect(agent.discoveredAgent.host, agent.discoveredAgent.port, agent.code)

    await expect.poll(() => last(viewer.states), { timeout: 3_000 }).toBe('connected')
    await expect.poll(() => agent.sessionState.phase, { timeout: 3_000 }).toBe('active')
    await expect.poll(() => streamSink.current?.id, { timeout: 3_000 }).toBe('agent-stream')

    video.dispatch('mousemove', { clientX: 480, clientY: 270 })
    video.dispatch('mousedown', { button: 0, clientX: 480, clientY: 270 })
    video.dispatch('mouseup', { button: 0, clientX: 480, clientY: 270 })
    video.dispatch('mousedown', { button: 2, clientX: 960, clientY: 540 })
    video.dispatch('mouseup', { button: 2, clientX: 960, clientY: 540 })
    video.dispatch('wheel', { clientX: 480, clientY: 270, deltaX: 3, deltaY: -4 })
    browserRuntime?.window.emit('keydown', keyEvent('ControlLeft', { ctrlKey: true }))
    browserRuntime?.window.emit('keydown', keyEvent('KeyC', { ctrlKey: true }))
    browserRuntime?.window.emit('keyup', keyEvent('KeyC', { ctrlKey: true }))
    browserRuntime?.window.emit('keyup', keyEvent('ControlLeft'))

    await expect
      .poll(() => agent.driver.move.mock.calls, { timeout: 1_000 })
      .toContainEqual([{ x: 1_000, y: 500 }])
    await expect
      .poll(() => agent.driver.buttonDown.mock.calls, { timeout: 1_000 })
      .toEqual([['left'], ['right']])
    await expect
      .poll(() => agent.driver.buttonUp.mock.calls, { timeout: 1_000 })
      .toEqual([['left'], ['right']])
    await expect
      .poll(() => agent.driver.scroll.mock.calls, { timeout: 1_000 })
      .toContainEqual([3, -4])
    await expect.poll(() => agent.driver.keyDown.mock.calls).toContainEqual(['KeyC'])
    await expect
      .poll(() => agent.driver.keyUp.mock.calls, { timeout: 1_000 })
      .toContainEqual(['KeyC'])
    await expect
      .poll(() => agent.driver.keyUp.mock.calls, { timeout: 1_000 })
      .toContainEqual(['ControlLeft'])

    viewerController.stop()
    await viewer.api.disconnect()

    await expect.poll(() => agent.sessionState.phase, { timeout: 1_000 }).toBe('pairing')
    await expect.poll(() => last(viewer.states), { timeout: 1_000 }).toBe('disconnected')
  })

  it('locks a viewer out after three wrong codes and rotates the pairing code', async () => {
    const now = new ManualClock()
    const agent = track(new AgentRuntime({ now: () => now.value }))
    await agent.start()
    const viewer = track(new ViewerRuntime(() => [agent.discoveredAgent]))
    const initialCode = agent.code
    const wrong = wrongCode(initialCode)

    await viewer.api.connect(agent.discoveredAgent.host, agent.discoveredAgent.port, wrong)
    await viewer.sendPairRequest(wrong)
    await viewer.sendPairRequest(wrong)

    await expect
      .poll(
        () => viewer.pairResults.filter((message) => !message.ok).map((message) => message.reason),
        {
          timeout: 1_000,
        },
      )
      .toEqual([
        ErrorCode.E_PAIR_INVALID_CODE,
        ErrorCode.E_PAIR_INVALID_CODE,
        ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS,
      ])
    expect(agent.code).not.toBe(initialCode)

    await viewer.sendPairRequest(agent.code)

    await expect
      .poll(() => last(viewer.pairResults)?.reason, { timeout: 1_000 })
      .toBe(ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS)

    now.advance(60_000)
    await viewer.sendPairRequest(agent.code)

    await expect.poll(() => last(viewer.pairResults)?.ok, { timeout: 1_000 }).toBe(true)
  })

  it('rejects a second Viewer while the first Viewer is active', async () => {
    const agent = track(new AgentRuntime())
    await agent.start()
    const firstViewer = track(new ViewerRuntime(() => [agent.discoveredAgent]))
    track(
      await createViewerPeerController({
        api: firstViewer.api,
        onStream: () => undefined,
        onStats: () => undefined,
      }),
    )
    await firstViewer.api.connect(
      agent.discoveredAgent.host,
      agent.discoveredAgent.port,
      agent.code,
    )
    await expect.poll(() => agent.sessionState.phase, { timeout: 3_000 }).toBe('active')

    const secondViewer = track(new ViewerRuntime(() => [agent.discoveredAgent]))
    await secondViewer.api.connect(
      agent.discoveredAgent.host,
      agent.discoveredAgent.port,
      agent.code,
    )

    await expect
      .poll(() => secondViewer.messages, { timeout: 1_000 })
      .toContainEqual({ v: PROTOCOL_VERSION, t: 'bye', reason: ErrorCode.E_PEER_BUSY })
    await expect.poll(() => last(secondViewer.states), { timeout: 1_000 }).toBe('disconnected')
  })

  it('releases stuck modifiers after an abrupt Viewer transport loss', async () => {
    const agent = track(new AgentRuntime())
    await agent.start()
    const viewer = track(new ViewerRuntime(() => [agent.discoveredAgent]))
    const viewerController = track(
      await createViewerPeerController({
        api: viewer.api,
        onStream: () => undefined,
        onStats: () => undefined,
      }),
    )
    const video = new FakeVideo()
    const detachInput = createInputSender(viewerController.inputChannels()).attach(video)
    cleanups.push(detachInput)

    await viewer.api.connect(agent.discoveredAgent.host, agent.discoveredAgent.port, agent.code)
    await expect.poll(() => agent.sessionState.phase, { timeout: 3_000 }).toBe('active')

    browserRuntime?.window.emit('keydown', keyEvent('ShiftLeft', { shiftKey: true }))
    await expect
      .poll(() => agent.driver.keyDown.mock.calls, { timeout: 1_000 })
      .toContainEqual(['ShiftLeft'])

    await viewer.closeTransportOnly()

    await expect.poll(() => agent.sessionState.phase, { timeout: 1_000 }).toBe('pairing')
    await expect
      .poll(() => agent.driver.keyUp.mock.calls, { timeout: 1_000 })
      .toContainEqual(['ShiftLeft'])
  })
})

class EventBus<TEvent> {
  readonly #listeners = new Set<(event: TEvent) => void>()

  on(listener: (event: TEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  emit(event: TEvent): void {
    for (const listener of this.#listeners) {
      listener(event)
    }
  }
}

class AgentRuntime {
  readonly session: AgentSessionStateMachine
  readonly events = new EventBus<AgentEvent>()
  readonly driver = createDriver()
  readonly #stream = createMediaStream()
  readonly #input: InputInjector
  readonly #peerSession: AgentPeerSessionManager<MediaStream, AgentPeerController>
  readonly #signaling: AgentSignalingHost
  readonly #now: () => number
  #unsubscribeSession: (() => void) | undefined

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now
    this.session = new AgentSessionStateMachine({ now: this.#now })
    this.#input = new InputInjector({ driver: this.driver })
    this.#peerSession = new AgentPeerSessionManager<MediaStream, AgentPeerController>({
      capture: async () => this.#stream,
      createController: (stream) => createAgentPeerController(this.api, stream),
      stopStream: (stream) => {
        for (const track of stream.getTracks()) {
          track.stop()
        }
      },
      reportPeerConnectionState: (state) => this.api.reportPeerConnectionState(state),
    })
    this.#signaling = new AgentSignalingHost({
      session: this.session,
      host: '127.0.0.1',
      port: 0,
      callbacks: {
        onAnswer: (message) => this.events.emit({ type: 'signaling-message', message }),
        onIce: (message) => this.events.emit({ type: 'signaling-message', message }),
        onBye: (message) => {
          void this.#finishDisconnect(message.reason ?? 'peer-bye')
        },
        onConnectionLost: (viewerId, state) => {
          void this.#finishDisconnect(
            state === 'error' ? ErrorCode.E_TRANSPORT_TIMEOUT : 'transport-closed',
            viewerId,
          )
        },
      },
    })
  }

  get api(): AgentApi {
    return {
      checkPermissions: async () => ({ screen: true, accessibility: true }),
      getStatus: async () => this.status,
      startSession: async () => this.session.state,
      stopSession: async () => {
        this.session.disconnect('user-stop')
        await this.#input.releaseAll()
        this.session.cleanupComplete()
        return this.session.state
      },
      sendMouse: async (message) => {
        await this.#input.handleMouse(message, displaySize)
      },
      sendKey: async (message) => {
        await this.#input.handleKey(message)
      },
      sendSignal: async (message) => {
        this.#signaling.send(message)
      },
      reportPeerConnectionState: async (state) => this.#reportPeerConnectionState(state),
      onEvent: (listener) => this.events.on(listener),
    }
  }

  get status(): AgentStatus {
    return {
      permissions: { screen: true, accessibility: true },
      session: this.session.state,
      signaling: this.#signaling.address,
    }
  }

  get sessionState(): AgentSessionState {
    return this.session.state
  }

  get code(): string {
    return this.session.state.phase === 'pairing' ? this.session.state.code : ''
  }

  get discoveredAgent(): DiscoveredAgent {
    return {
      id: 'agent-e2e',
      name: 'E2E Agent',
      host: '127.0.0.1',
      port: this.#signaling.port,
      txt: { v: String(PROTOCOL_VERSION) },
      lastSeen: this.#now(),
    }
  }

  async start(): Promise<void> {
    this.#unsubscribeSession = this.session.onStateChange((state) =>
      this.#handleSessionState(state),
    )
    await this.#signaling.start()
    this.#handleSessionState(this.session.state)
  }

  async stop(): Promise<void> {
    this.#unsubscribeSession?.()
    this.#peerSession.stop()
    await this.#signaling.stop()
    await this.#input.releaseAll()
  }

  #handleSessionState(state: AgentSessionState): void {
    this.events.emit({ type: 'session-state', state })
    if (state.phase === 'pairing') {
      this.#peerSession.stop()
      this.events.emit({ type: 'pairing-code', code: state.code, expiresAt: state.expiresAt })
    }
    if (state.phase === 'connecting') {
      void this.#peerSession.start()
    }
    if (state.phase === 'active') {
      this.events.emit({ type: 'viewer-connected', viewerId: state.viewerId })
    }
    if (state.phase === 'disconnecting') {
      this.#peerSession.stop()
    }
  }

  async #reportPeerConnectionState(state: AgentPeerConnectionState): Promise<AgentSessionState> {
    if (state === 'connected') {
      this.session.peerConnected()
      return this.session.state
    }

    await this.#finishDisconnect(
      state === 'failed' ? ErrorCode.E_ICE_FAILED : ErrorCode.E_TRANSPORT_TIMEOUT,
    )
    return this.session.state
  }

  async #finishDisconnect(reason: string, viewerId = 'viewer-e2e'): Promise<void> {
    this.session.disconnect(reason)
    await this.#input.releaseAll()
    this.session.cleanupComplete()
    this.events.emit({ type: 'viewer-disconnected', viewerId, reason })
  }
}

class ViewerRuntime {
  readonly events = new EventBus<ViewerEvent>()
  readonly states: ConnectionState[] = []
  readonly messages: SignalingMessage[] = []
  readonly pairResults: Array<Extract<SignalingMessage, { t: 'pair-result' }>> = []
  readonly api: ViewerApi = {
    discoverAgents: async () => this.#discoverAgents(),
    connect: (host, port, code) => this.connect(host, port, code),
    disconnect: () => this.disconnect(),
    sendSignal: async (message) => {
      this.#transport?.send(message)
    },
    reportPeerConnectionState: async (state) => {
      this.#setConnectionState(peerStateToViewerState(state))
    },
    onEvent: (listener) => this.events.on(listener),
  }
  readonly #discoverAgents: () => DiscoveredAgent[]
  readonly #clientId = crypto.randomUUID()
  #transport: EmbeddedClientTransport | undefined
  #unsubscribers: Array<() => void> = []

  constructor(discoverAgents: () => DiscoveredAgent[]) {
    this.#discoverAgents = discoverAgents
  }

  async connect(host: string, port: number, code: string): Promise<void> {
    await this.#stopTransport('idle')
    this.#setConnectionState('connecting')
    const transport = new EmbeddedClientTransport({ host, port })
    this.#transport = transport
    this.#unsubscribers = [
      transport.onMessage((message) => this.#handleMessage(message)),
      transport.onConnectionState((state) => {
        if (state === 'closed') {
          this.#setConnectionState('disconnected')
        }
        if (state === 'error') {
          this.#setConnectionState('failed')
        }
      }),
    ]

    await transport.start()
    transport.send({ v: PROTOCOL_VERSION, t: 'hello', role: 'viewer', clientId: this.#clientId })
    transport.send({ v: PROTOCOL_VERSION, t: 'pair-request', code })
  }

  async sendPairRequest(code: string): Promise<void> {
    this.#transport?.send({ v: PROTOCOL_VERSION, t: 'pair-request', code })
    await settle()
  }

  async disconnect(): Promise<void> {
    this.#transport?.send({ v: PROTOCOL_VERSION, t: 'bye', reason: 'viewer-disconnect' })
    await this.#stopTransport('disconnected')
  }

  async closeTransportOnly(): Promise<void> {
    await this.#stopTransport('disconnected')
  }

  async stop(): Promise<void> {
    await this.#stopTransport('idle')
  }

  #handleMessage(message: SignalingMessage): void {
    this.messages.push(message)
    if (message.t === 'pair-result') {
      this.pairResults.push(message)
      if (!message.ok) {
        this.#setConnectionState('failed')
      }
    }
    this.events.emit({ type: 'signaling-message', message })
  }

  async #stopTransport(nextState: ConnectionState): Promise<void> {
    const active = this.#transport
    for (const unsubscribe of this.#unsubscribers.splice(0)) {
      unsubscribe()
    }
    this.#transport = undefined
    if (active !== undefined) {
      await active.stop()
    }
    this.#setConnectionState(nextState)
  }

  #setConnectionState(state: ConnectionState): void {
    this.states.push(state)
    this.events.emit({ type: 'connection-state', state })
  }
}

class StreamSink {
  current: MediaStream | undefined

  set(stream: MediaStream): void {
    this.current = stream
  }
}

class ManualClock {
  value = 1_000

  advance(ms: number): void {
    this.value += ms
  }
}

class FakeVideo {
  readonly videoWidth = 1_920
  readonly videoHeight = 1_080
  readonly focus = vi.fn()
  readonly #listeners = new Map<string, Set<EventListener>>()

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 960, height: 540 }
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.#listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.#listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.#listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: Record<string, unknown>): void {
    const eventWithDefault = {
      preventDefault: vi.fn(),
      ...event,
    } as unknown as Event
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(eventWithDefault)
    }
  }
}

class FakeWindowTarget {
  readonly #listeners = new Map<string, Set<EventListener>>()
  readonly #timers = new Set<ReturnType<typeof setInterval>>()

  setInterval(handler: () => void, timeout?: number): number {
    const timer = setInterval(handler, timeout)
    this.#timers.add(timer)
    return timer as unknown as number
  }

  clearInterval(timer: number): void {
    const nodeTimer = timer as unknown as ReturnType<typeof setInterval>
    clearInterval(nodeTimer)
    this.#timers.delete(nodeTimer)
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.#listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.#listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.#listeners.get(type)?.delete(listener)
  }

  emit(type: string, event: Record<string, unknown> = {}): void {
    const eventWithDefault = {
      preventDefault: vi.fn(),
      ...event,
    } as unknown as Event
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(eventWithDefault)
    }
  }

  cleanup(): void {
    for (const timer of this.#timers) {
      clearInterval(timer)
    }
    this.#timers.clear()
    this.#listeners.clear()
  }
}

class FakeDocumentTarget {
  visibilityState: DocumentVisibilityState = 'visible'
  readonly #listeners = new Map<string, Set<EventListener>>()

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.#listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.#listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.#listeners.get(type)?.delete(listener)
  }
}

class FakeDataChannel {
  readonly label: string
  bufferedAmount = 0
  readyState: RTCDataChannelState = 'open'
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  #peer: FakeDataChannel | undefined

  constructor(label: string) {
    this.label = label
  }

  link(peer: FakeDataChannel): void {
    this.#peer = peer
  }

  send(data: string): void {
    if (this.readyState !== 'open' || this.#peer?.readyState !== 'open') {
      return
    }

    queueMicrotask(() => {
      this.#peer?.onmessage?.({ data } as MessageEvent<string>)
    })
  }

  close(): void {
    this.readyState = 'closed'
  }
}

class FakeIceCandidate {
  constructor(readonly candidate: string) {}

  toJSON(): RTCIceCandidateInit {
    return { candidate: this.candidate, sdpMid: '0', sdpMLineIndex: 0 }
  }
}

class FakeSessionDescription {
  readonly type: RTCSdpType
  readonly sdp: string

  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type
    this.sdp = init.sdp ?? ''
  }
}

class FakePeerConnection {
  static waiting: FakePeerConnection | undefined

  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  connectionState: RTCPeerConnectionState = 'new'
  iceConnectionState: RTCIceConnectionState = 'new'
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  onconnectionstatechange: ((event: Event) => void) | null = null
  oniceconnectionstatechange: ((event: Event) => void) | null = null
  #ontrack: ((event: RTCTrackEvent) => void) | null = null
  #ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null
  #partner: FakePeerConnection | undefined
  #pendingChannels: FakeDataChannel[] = []
  #pendingStreams: MediaStream[] = []

  constructor() {
    const waiting = FakePeerConnection.waiting
    if (waiting === undefined) {
      FakePeerConnection.waiting = this
      return
    }

    this.#partner = waiting
    waiting.#partner = this
    FakePeerConnection.waiting = undefined
    this.#flush()
    waiting.#flush()
  }

  get ontrack(): ((event: RTCTrackEvent) => void) | null {
    return this.#ontrack
  }

  set ontrack(handler: ((event: RTCTrackEvent) => void) | null) {
    this.#ontrack = handler
    this.#flush()
  }

  get ondatachannel(): ((event: RTCDataChannelEvent) => void) | null {
    return this.#ondatachannel
  }

  set ondatachannel(handler: ((event: RTCDataChannelEvent) => void) | null) {
    this.#ondatachannel = handler
    this.#flush()
  }

  addTrack(_track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    this.#pendingStreams.push(stream)
    this.#flush()
    return {
      getParameters: () => ({ encodings: [] }),
      setParameters: async () => undefined,
    } as unknown as RTCRtpSender
  }

  createDataChannel(label: string): RTCDataChannel {
    const local = new FakeDataChannel(label)
    const remote = new FakeDataChannel(label)
    local.link(remote)
    remote.link(local)
    this.#pendingChannels.push(remote)
    this.#flush()
    return local as unknown as RTCDataChannel
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 H264/90000\r\n',
    }
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description
    this.onicecandidate?.({
      candidate: new FakeIceCandidate(
        `candidate:${description.type}`,
      ) as unknown as RTCIceCandidate,
    } as RTCPeerConnectionIceEvent)
    this.#maybeConnect()
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description
    this.#maybeConnect()
  }

  async addIceCandidate(): Promise<void> {
    return undefined
  }

  async getStats(): Promise<RTCStatsReport> {
    return new Map() as unknown as RTCStatsReport
  }

  close(): void {
    this.connectionState = 'closed'
    this.iceConnectionState = 'closed'
  }

  #flush(): void {
    const partner = this.#partner
    if (partner === undefined) {
      return
    }

    if (partner.#ondatachannel !== null) {
      const channels = this.#pendingChannels.splice(0)
      for (const channel of channels) {
        queueMicrotask(() => {
          partner.#ondatachannel?.({
            channel: channel as unknown as RTCDataChannel,
          } as RTCDataChannelEvent)
        })
      }
    }

    if (partner.#ontrack !== null) {
      const streams = this.#pendingStreams.splice(0)
      for (const stream of streams) {
        queueMicrotask(() => {
          partner.#ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent)
        })
      }
    }
  }

  #maybeConnect(): void {
    this.#markConnectedIfReady()
    const partner = this.#partner
    if (partner !== undefined) {
      partner.#markConnectedIfReady()
    }
  }

  #markConnectedIfReady(): void {
    if (
      this.connectionState === 'connected' ||
      this.localDescription === null ||
      this.remoteDescription === null
    ) {
      return
    }

    this.connectionState = 'connected'
    this.iceConnectionState = 'connected'
    queueMicrotask(() => {
      this.onconnectionstatechange?.({} as Event)
      this.oniceconnectionstatechange?.({} as Event)
    })
  }
}

type BrowserRuntime = {
  window: FakeWindowTarget
  document: FakeDocumentTarget
  cleanup(): void
}

function installBrowserRuntime(): BrowserRuntime {
  FakePeerConnection.waiting = undefined
  const windowTarget = new FakeWindowTarget()
  const documentTarget = new FakeDocumentTarget()
  const previousWindow = Reflect.get(globalThis, 'window') as unknown
  const previousDocument = Reflect.get(globalThis, 'document') as unknown
  const previousPeerConnection = Reflect.get(globalThis, 'RTCPeerConnection') as unknown
  const previousSessionDescription = Reflect.get(globalThis, 'RTCSessionDescription') as unknown

  Reflect.set(globalThis, 'window', windowTarget)
  Reflect.set(globalThis, 'document', documentTarget)
  Reflect.set(globalThis, 'RTCPeerConnection', FakePeerConnection)
  Reflect.set(globalThis, 'RTCSessionDescription', FakeSessionDescription)

  return {
    window: windowTarget,
    document: documentTarget,
    cleanup() {
      windowTarget.cleanup()
      restoreGlobal('window', previousWindow)
      restoreGlobal('document', previousDocument)
      restoreGlobal('RTCPeerConnection', previousPeerConnection)
      restoreGlobal('RTCSessionDescription', previousSessionDescription)
      FakePeerConnection.waiting = undefined
    },
  }
}

function restoreGlobal(name: string, value: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name)
    return
  }

  Reflect.set(globalThis, name, value)
}

function createDriver() {
  return {
    validateKey: vi.fn<(code: string) => void>(),
    move: vi.fn<(point: { x: number; y: number }) => void>(),
    buttonDown: vi.fn<(button: 'left' | 'middle' | 'right') => void>(),
    buttonUp: vi.fn<(button: 'left' | 'middle' | 'right') => void>(),
    scroll: vi.fn<(dx: number, dy: number) => void>(),
    keyDown: vi.fn<(code: string) => void>(),
    keyUp: vi.fn<(code: string) => void>(),
  }
}

function createMediaStream(): MediaStream {
  const track = {
    stop: vi.fn(),
  } as unknown as MediaStreamTrack

  return {
    id: 'agent-stream',
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream
}

function keyEvent(
  code: string,
  modifiers: Partial<Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>> = {},
): Record<string, unknown> {
  return {
    code,
    shiftKey: modifiers.shiftKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
  }
}

function peerStateToViewerState(state: ViewerPeerConnectionState): ConnectionState {
  if (state === 'connected') {
    return 'connected'
  }
  if (state === 'failed') {
    return 'failed'
  }
  return 'disconnected'
}

function wrongCode(code: string): string {
  const replacement = code[0] === 'A' ? 'B' : 'A'
  return `${replacement}${code.slice(1)}`
}

function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1]
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function track<T extends { stop(): Promise<void> | void }>(value: T): T {
  cleanups.push(() => value.stop())
  return value
}
