import type { SignalingTransport } from '@desk/signaling'
import { ErrorCode, PROTOCOL_VERSION, type SignalingMessage } from '@desk/shared'

import { EmbeddedServerTransport } from '../signaling/embedded-server.js'
import type { AgentSessionStateMachine } from './session-state.js'

type PairAcceptedCallback = (viewerId: string) => void

export type AgentSignalingCallbacks = {
  onPairAccepted?: PairAcceptedCallback
  onAnswer?: (message: Extract<SignalingMessage, { t: 'answer' }>) => void
  onOffer?: (message: Extract<SignalingMessage, { t: 'offer' }>) => void
  onIce?: (message: Extract<SignalingMessage, { t: 'ice' }>) => void
  onBye?: (message: Extract<SignalingMessage, { t: 'bye' }>) => void
  onPong?: (message: Extract<SignalingMessage, { t: 'pong' }>) => void
  onConnectionLost?: (viewerId: string, state: 'closed' | 'error') => void | Promise<void>
}

export type AgentSignalingHostOptions = {
  session: AgentSessionStateMachine
  host?: string
  port?: number
  callbacks?: AgentSignalingCallbacks
  createTransport?: (options: {
    host: string
    port: number
  }) => SignalingTransport & { port: number }
}

export class AgentSignalingHost {
  readonly #host: string
  readonly #configuredPort: number
  readonly #session: AgentSessionStateMachine
  readonly #callbacks: AgentSignalingCallbacks
  readonly #createTransport: (options: { host: string; port: number }) => SignalingTransport & {
    port: number
  }
  #transport: (SignalingTransport & { port: number }) | undefined
  #unsubscribers: Array<() => void> = []
  #viewerId: string | undefined

  constructor(options: AgentSignalingHostOptions) {
    this.#host = options.host ?? '0.0.0.0'
    this.#configuredPort = options.port ?? 0
    this.#session = options.session
    this.#callbacks = options.callbacks ?? {}
    this.#createTransport =
      options.createTransport ??
      ((transportOptions) => new EmbeddedServerTransport(transportOptions))
  }

  get port(): number {
    return this.#transport?.port ?? this.#configuredPort
  }

  get address(): { host: string; port: number } {
    return { host: this.#host, port: this.port }
  }

  async start(): Promise<void> {
    if (this.#transport !== undefined) {
      return
    }

    const transport = this.#createTransport({ host: this.#host, port: this.#configuredPort })
    this.#transport = transport
    this.#unsubscribers = [
      transport.onMessage((message) => this.#handleMessage(message)),
      transport.onConnectionState((state) => {
        if (state === 'closed' || state === 'error') {
          if (this.#viewerId !== undefined) {
            void this.#callbacks.onConnectionLost?.(this.#viewerId, state)
          }
          this.#viewerId = undefined
        }
      }),
    ]

    await transport.start()
  }

  async stop(): Promise<void> {
    const transport = this.#transport
    if (transport === undefined) {
      return
    }

    for (const unsubscribe of this.#unsubscribers.splice(0)) {
      unsubscribe()
    }
    this.#transport = undefined
    this.#viewerId = undefined
    await transport.stop()
  }

  send(message: SignalingMessage): void {
    this.#transport?.send(message)
  }

  #handleMessage(message: SignalingMessage): void {
    switch (message.t) {
      case 'hello':
        if (message.role === 'viewer') {
          this.#viewerId = message.clientId
        }
        break
      case 'pair-request':
        this.#handlePairRequest(message)
        break
      case 'answer':
        this.#callbacks.onAnswer?.(message)
        break
      case 'offer':
        this.#callbacks.onOffer?.(message)
        break
      case 'ice':
        this.#callbacks.onIce?.(message)
        break
      case 'bye':
        this.#callbacks.onBye?.(message)
        break
      case 'ping':
        this.send({ v: PROTOCOL_VERSION, t: 'pong' })
        break
      case 'pong':
        this.#callbacks.onPong?.(message)
        break
      case 'pair-result':
        break
    }
  }

  #handlePairRequest(message: Extract<SignalingMessage, { t: 'pair-request' }>): void {
    const viewerId = this.#viewerId
    if (viewerId === undefined) {
      this.send({
        v: PROTOCOL_VERSION,
        t: 'pair-result',
        ok: false,
        reason: ErrorCode.E_PEER_BUSY,
      })
      return
    }

    const result = this.#session.handlePairRequest(viewerId, message.code)
    this.send(result)
    if (result.ok) {
      this.#callbacks.onPairAccepted?.(viewerId)
    }
  }
}
