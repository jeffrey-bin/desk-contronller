import type { SignalingMessage } from '@desk/shared'
import {
  decodeMessage,
  encodeMessage,
  type ConnectionState,
  type DecodeResult,
  type SignalingTransport,
  type Unsubscribe,
} from '@desk/signaling'
import WebSocket from 'ws'

type DecodeFailureReason = Extract<DecodeResult, { ok: false }>['reason']

export type RelayOpts = {
  url: string
  roomId: string
  role: 'agent' | 'viewer'
  clientId: string
  logger?: {
    warn(message: string): void
  }
}

export class RelayClientTransport implements SignalingTransport {
  readonly #url: string
  readonly #roomId: string
  readonly #role: RelayOpts['role']
  readonly #clientId: string
  readonly #logger: RelayOpts['logger']
  #socket: WebSocket | undefined
  #startPromise: Promise<void> | undefined
  readonly #messageHandlers = new Set<(msg: SignalingMessage) => void>()
  readonly #stateHandlers = new Set<(state: ConnectionState) => void>()

  constructor(opts: RelayOpts) {
    this.#url = opts.url
    this.#roomId = opts.roomId
    this.#role = opts.role
    this.#clientId = opts.clientId
    this.#logger = opts.logger
  }

  start(): Promise<void> {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    if (this.#startPromise) {
      return this.#startPromise
    }

    const socket = new WebSocket(this.#url)
    this.#socket = socket

    socket.on('message', (data) => {
      const decoded = decodeMessage(data.toString())

      if (!decoded.ok) {
        this.#warnInvalid(decoded.reason)
        return
      }

      this.#emitMessage(decoded.value)
    })

    socket.on('close', () => {
      if (this.#socket !== socket) {
        return
      }

      this.#socket = undefined
      this.#startPromise = undefined
      this.#emitState('closed')
    })

    socket.on('error', () => {
      if (this.#socket !== socket) {
        return
      }

      this.#socket = undefined
      this.#startPromise = undefined
      this.#emitState('error')
    })

    this.#startPromise = new Promise<void>((resolve, reject) => {
      socket.once('open', () => {
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
      })
      socket.once('error', reject)
    })

    return this.#startPromise
  }

  async stop(): Promise<void> {
    const socket = this.#socket

    if (!socket) {
      return
    }

    if (socket.readyState === WebSocket.CLOSED) {
      this.#socket = undefined
      this.#startPromise = undefined
      return
    }

    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve())
      socket.close()
    })
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
