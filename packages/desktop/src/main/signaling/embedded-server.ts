import { ErrorCode, type SignalingMessage } from '@desk/shared'
import {
  decodeMessage,
  encodeMessage,
  type ConnectionState,
  type DecodeResult,
  type SignalingTransport,
  type Unsubscribe,
} from '@desk/signaling'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'

type DecodeFailureReason = Extract<DecodeResult, { ok: false }>['reason']

export type ServerOpts = {
  host: string
  port: number
  logger?: {
    warn(message: string): void
  }
}

export class EmbeddedServerTransport implements SignalingTransport {
  readonly #host: string
  readonly #logger: ServerOpts['logger']
  #configuredPort: number
  #server: WebSocketServer | undefined
  #client: WebSocket | undefined
  readonly #messageHandlers = new Set<(msg: SignalingMessage) => void>()
  readonly #stateHandlers = new Set<(state: ConnectionState) => void>()

  constructor(opts: ServerOpts) {
    this.#host = opts.host
    this.#configuredPort = opts.port
    this.#logger = opts.logger
  }

  get port(): number {
    return this.#configuredPort
  }

  async start(): Promise<void> {
    if (this.#server) {
      return
    }

    const server = new WebSocketServer({ host: this.#host, port: this.#configuredPort })
    this.#server = server

    server.on('connection', (socket) => this.#handleConnection(socket))
    server.on('error', () => this.#emitState('error'))

    await new Promise<void>((resolve, reject) => {
      const handleListenError = (error: Error): void => {
        if (this.#server === server) {
          this.#server = undefined
        }

        server.close()
        reject(error)
      }

      server.once('listening', () => {
        server.off('error', handleListenError)
        const address = server.address()

        if (typeof address === 'object' && address !== null) {
          this.#configuredPort = (address as AddressInfo).port
        }

        resolve()
      })
      server.once('error', handleListenError)
    })
  }

  async stop(): Promise<void> {
    const server = this.#server

    if (!server) {
      return
    }

    this.#server = undefined

    const client = this.#client
    this.#client = undefined

    if (client && client.readyState !== client.CLOSED) {
      client.close()
    }

    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })

    this.#emitState('closed')
  }

  send(msg: SignalingMessage): void {
    const client = this.#client

    if (client && client.readyState === client.OPEN) {
      client.send(encodeMessage(msg))
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

  #handleConnection(socket: WebSocket): void {
    if (this.#client && this.#client.readyState === this.#client.OPEN) {
      socket.send(encodeMessage({ v: 1, t: 'bye', reason: ErrorCode.E_PEER_BUSY }))
      socket.close()
      return
    }

    this.#client = socket
    this.#emitState('open')

    socket.on('message', (data) => {
      const decoded = decodeMessage(data.toString())

      if (!decoded.ok) {
        this.#warnInvalid(decoded.reason)
        return
      }

      this.#emitMessage(decoded.value)
    })

    socket.on('close', () => {
      if (this.#client === socket) {
        this.#client = undefined
        this.#emitState('closed')
      }
    })

    socket.on('error', () => this.#emitState('error'))
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
