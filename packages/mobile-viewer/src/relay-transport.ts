import type { SignalingMessage } from '@desk/shared'
import {
  decodeMessage,
  encodeMessage,
  type ConnectionState,
  type DecodeResult,
  type SignalingTransport,
  type Unsubscribe,
} from '@desk/signaling'

type DecodeFailureReason = Extract<DecodeResult, { ok: false }>['reason']

type RelayWebSocket = {
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open', listener: () => void, options?: { once?: boolean }): void
  addEventListener(
    type: 'message',
    listener: (event: { data?: unknown }) => void,
    options?: { once?: boolean },
  ): void
  addEventListener(
    type: 'close' | 'error',
    listener: () => void,
    options?: { once?: boolean },
  ): void
}

type RelayWebSocketConstructor = new (url: string) => RelayWebSocket

export type MobileRelayTransportOptions = {
  url: string
  roomId: string
  role: 'agent' | 'viewer'
  clientId: string
  webSocketCtor?: RelayWebSocketConstructor
  logger?: {
    warn(message: string): void
  }
}

export class MobileRelayTransport implements SignalingTransport {
  readonly #url: string
  readonly #roomId: string
  readonly #role: MobileRelayTransportOptions['role']
  readonly #clientId: string
  readonly #webSocketCtor: RelayWebSocketConstructor
  readonly #logger: MobileRelayTransportOptions['logger']
  #socket: RelayWebSocket | undefined
  #startPromise: Promise<void> | undefined
  readonly #messageHandlers = new Set<(msg: SignalingMessage) => void>()
  readonly #stateHandlers = new Set<(state: ConnectionState) => void>()

  constructor(opts: MobileRelayTransportOptions) {
    this.#url = opts.url
    this.#roomId = opts.roomId
    this.#role = opts.role
    this.#clientId = opts.clientId
    this.#webSocketCtor = opts.webSocketCtor ?? WebSocket
    this.#logger = opts.logger
  }

  start(): Promise<void> {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.#startPromise !== undefined) {
      return this.#startPromise
    }

    const socket = new this.#webSocketCtor(this.#url)
    this.#socket = socket

    socket.addEventListener('message', (event) => {
      const decoded = decodeMessage(String(event.data))

      if (!decoded.ok) {
        this.#warnInvalid(decoded.reason)
        return
      }

      this.#emitMessage(decoded.value)
    })

    socket.addEventListener('close', () => {
      if (this.#socket !== socket) {
        return
      }

      this.#socket = undefined
      this.#startPromise = undefined
      this.#emitState('closed')
    })

    socket.addEventListener('error', () => {
      if (this.#socket !== socket) {
        return
      }

      this.#socket = undefined
      this.#startPromise = undefined
      this.#emitState('error')
    })

    this.#startPromise = new Promise<void>((resolve, reject) => {
      socket.addEventListener(
        'open',
        () => {
          if (this.#socket !== socket) {
            return
          }

          socket.send(
            encodeMessage({
              v: 1,
              t: 'join-room',
              roomId: this.#roomId,
              role: this.#role,
              clientId: this.#clientId,
            }),
          )
          this.#startPromise = undefined
          this.#emitState('open')
          resolve()
        },
        { once: true },
      )
      socket.addEventListener('error', () => reject(new Error('Relay WebSocket error')), {
        once: true,
      })
    })

    return this.#startPromise
  }

  async stop(): Promise<void> {
    const socket = this.#socket

    if (socket === undefined) {
      return
    }

    this.#socket = undefined
    this.#startPromise = undefined
    socket.close()
  }

  send(msg: SignalingMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(encodeMessage(msg))
    }
  }

  onMessage(handler: (msg: SignalingMessage) => void): Unsubscribe {
    this.#messageHandlers.add(handler)

    return () => {
      this.#messageHandlers.delete(handler)
    }
  }

  onConnectionState(handler: (s: ConnectionState) => void): Unsubscribe {
    this.#stateHandlers.add(handler)

    return () => {
      this.#stateHandlers.delete(handler)
    }
  }

  #emitMessage(message: SignalingMessage): void {
    for (const handler of this.#messageHandlers) {
      handler(message)
    }
  }

  #emitState(state: ConnectionState): void {
    for (const handler of this.#stateHandlers) {
      handler(state)
    }
  }

  #warnInvalid(reason: DecodeFailureReason): void {
    this.#logger?.warn(`Discarded invalid signaling message: ${reason}`)
  }
}
