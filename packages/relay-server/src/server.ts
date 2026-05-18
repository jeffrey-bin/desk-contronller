import { ErrorCode, type SignalingMessage } from '@desk/shared'
import { decodeMessage, encodeMessage, type DecodeResult } from '@desk/signaling'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'

type DecodeFailureReason = Extract<DecodeResult, { ok: false }>['reason']
type RelayRole = 'agent' | 'viewer'
type JoinRoomMessage = Extract<SignalingMessage, { t: 'join-room' }>

type RelayLogger = {
  warn(message: string): void
}

type RelayPeer = {
  socket: WebSocket
  roomId: string
  role: RelayRole
  clientId: string
}

type RelayRoom = Partial<Record<RelayRole, RelayPeer>>

export type RelayServerOptions = {
  host: string
  port: number
  logger?: RelayLogger
}

export class RelayServer {
  readonly #host: string
  readonly #logger: RelayLogger | undefined
  #configuredPort: number
  #server: WebSocketServer | undefined
  readonly #rooms = new Map<string, RelayRoom>()
  readonly #peers = new Map<WebSocket, RelayPeer>()

  constructor(opts: RelayServerOptions) {
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

    for (const peer of this.#peers.values()) {
      if (peer.socket.readyState !== peer.socket.CLOSED) {
        peer.socket.close()
      }
    }

    this.#peers.clear()
    this.#rooms.clear()

    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }

  #handleConnection(socket: WebSocket): void {
    socket.on('message', (data) => this.#handleRawMessage(socket, data.toString()))
    socket.on('close', () => this.#removePeer(socket))
    socket.on('error', () => this.#removePeer(socket))
  }

  #handleRawMessage(socket: WebSocket, raw: string): void {
    const decoded = decodeMessage(raw)

    if (!decoded.ok) {
      this.#warnInvalid(decoded.reason)
      return
    }

    const peer = this.#peers.get(socket)

    if (!peer) {
      if (decoded.value.t !== 'join-room') {
        this.#logger?.warn('Discarded relay message before join-room')
        return
      }

      this.#joinRoom(socket, decoded.value)
      return
    }

    if (decoded.value.t === 'join-room') {
      return
    }

    this.#routeMessage(peer, decoded.value)
  }

  #joinRoom(socket: WebSocket, message: JoinRoomMessage): void {
    const room = this.#rooms.get(message.roomId) ?? {}
    const occupiedPeer = room[message.role]

    if (occupiedPeer && occupiedPeer.socket.readyState === occupiedPeer.socket.OPEN) {
      socket.send(encodeMessage({ v: 1, t: 'bye', reason: ErrorCode.E_PEER_BUSY }))
      socket.close()
      return
    }

    const peer: RelayPeer = {
      socket,
      roomId: message.roomId,
      role: message.role,
      clientId: message.clientId,
    }

    room[message.role] = peer
    this.#rooms.set(message.roomId, room)
    this.#peers.set(socket, peer)
  }

  #routeMessage(source: RelayPeer, message: SignalingMessage): void {
    const targetRole: RelayRole = source.role === 'agent' ? 'viewer' : 'agent'
    const target = this.#rooms.get(source.roomId)?.[targetRole]

    if (target && target.socket.readyState === target.socket.OPEN) {
      target.socket.send(encodeMessage(message))
    }
  }

  #removePeer(socket: WebSocket): void {
    const peer = this.#peers.get(socket)

    if (!peer) {
      return
    }

    this.#peers.delete(socket)

    const room = this.#rooms.get(peer.roomId)

    if (!room) {
      return
    }

    if (room[peer.role]?.socket === socket) {
      delete room[peer.role]
    }

    if (!room.agent && !room.viewer) {
      this.#rooms.delete(peer.roomId)
    }
  }

  #warnInvalid(reason: DecodeFailureReason): void {
    this.#logger?.warn(`Discarded invalid relay message: ${reason}`)
  }
}
