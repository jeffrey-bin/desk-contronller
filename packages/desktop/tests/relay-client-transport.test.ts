import type { SignalingMessage } from '@desk/shared'
import { decodeMessage, encodeMessage } from '@desk/signaling'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'
import type WebSocket from 'ws'

import { RelayClientTransport } from '../src/main/signaling/relay-client.js'

type RelayRole = 'agent' | 'viewer'

async function startRawServer(
  onConnection?: (socket: WebSocket) => void,
): Promise<WebSocketServer> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })

  if (onConnection) {
    server.on('connection', onConnection)
  }

  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  return server
}

async function stopRawServer(server: WebSocketServer | undefined): Promise<void> {
  if (!server) {
    return
  }

  for (const socket of server.clients) {
    if (socket.readyState !== socket.CLOSED) {
      socket.terminate()
    }
  }

  if (server.address() === null) {
    return
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

function serverUrl(server: WebSocketServer): string {
  const address = server.address()

  if (typeof address !== 'object' || address === null) {
    throw new Error('Expected raw server address')
  }

  return `ws://127.0.0.1:${(address as AddressInfo).port}`
}

function installTestRelay(server: WebSocketServer): () => number {
  const peers = new Map<RelayRole, WebSocket>()

  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      const decoded = decodeMessage(data.toString())

      if (!decoded.ok) {
        return
      }

      if (decoded.value.t === 'join-room') {
        peers.set(decoded.value.role, socket)
        return
      }

      const source = peers.get('agent') === socket ? 'agent' : 'viewer'
      const target = peers.get(source === 'agent' ? 'viewer' : 'agent')

      if (target && target.readyState === target.OPEN) {
        target.send(encodeMessage(decoded.value))
      }
    })
  })

  return () => peers.size
}

describe('RelayClientTransport', () => {
  let client: RelayClientTransport | undefined
  let agent: RelayClientTransport | undefined
  let viewer: RelayClientTransport | undefined
  let server: WebSocketServer | undefined

  afterEach(async () => {
    await client?.stop()
    await agent?.stop()
    await viewer?.stop()
    await stopRawServer(server)
    client = undefined
    agent = undefined
    viewer = undefined
    server = undefined
  })

  it('connects to a relay server and sends join-room on open', async () => {
    const joins: SignalingMessage[] = []
    server = await startRawServer((socket) => {
      socket.on('message', (data) => {
        const decoded = decodeMessage(data.toString())

        if (decoded.ok) {
          joins.push(decoded.value)
        }
      })
    })

    const states: string[] = []
    client = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'agent',
      clientId: 'agent-1',
    })
    client.onConnectionState((state) => states.push(state))

    await client.start()

    await expect
      .poll(() => joins)
      .toEqual([{ v: 1, t: 'join-room', roomId: 'room-1', role: 'agent', clientId: 'agent-1' }])
    expect(states).toEqual(['open'])
  })

  it('lets agent and viewer exchange messages through a relay', async () => {
    server = await startRawServer()
    const getPeerCount = installTestRelay(server)

    const agentMessages: SignalingMessage[] = []
    const viewerMessages: SignalingMessage[] = []

    agent = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'agent',
      clientId: 'agent-1',
    })
    viewer = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'viewer',
      clientId: 'viewer-1',
    })
    agent.onMessage((message) => agentMessages.push(message))
    viewer.onMessage((message) => viewerMessages.push(message))

    await Promise.all([agent.start(), viewer.start()])
    await expect.poll(getPeerCount).toBe(2)

    const ping = { v: 1, t: 'ping' } as const
    const pong = { v: 1, t: 'pong' } as const

    agent.send(ping)
    await expect.poll(() => viewerMessages).toEqual([ping])

    viewer.send(pong)
    await expect.poll(() => agentMessages).toEqual([pong])
  })

  it('emits closed when the relay server closes', async () => {
    server = await startRawServer()

    const states: string[] = []
    client = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'viewer',
      clientId: 'viewer-1',
    })
    client.onConnectionState((state) => states.push(state))

    await client.start()
    await stopRawServer(server)
    server = undefined

    await expect.poll(() => states).toEqual(['open', 'closed'])
  })

  it('emits error and rejects when connection fails', async () => {
    const url = 'ws://127.0.0.1:9'

    const states: string[] = []
    client = new RelayClientTransport({
      url,
      roomId: 'room-1',
      role: 'viewer',
      clientId: 'viewer-1',
    })
    client.onConnectionState((state) => states.push(state))

    await expect(client.start()).rejects.toThrow()
    expect(states).toContain('error')
  })

  it('returns the same promise for concurrent starts and does not reconnect while open', async () => {
    let connections = 0
    server = await startRawServer(() => {
      connections += 1
    })

    client = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'agent',
      clientId: 'agent-1',
    })

    const firstStart = client.start()
    const secondStart = client.start()

    expect(secondStart).toBe(firstStart)

    await Promise.all([firstStart, secondStart])
    await client.start()

    await expect.poll(() => connections).toBe(1)
  })

  it('closes cleanly when stopped after opening', async () => {
    server = await startRawServer()

    const states: string[] = []
    client = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'agent',
      clientId: 'agent-1',
    })
    client.onConnectionState((state) => states.push(state))

    await client.start()
    await client.stop()
    await client.stop()

    expect(states).toEqual(['open', 'closed'])
  })

  it('warns and discards invalid inbound messages', async () => {
    server = await startRawServer((socket) => socket.send('{nope'))

    const warnings: string[] = []
    const messages: SignalingMessage[] = []
    client = new RelayClientTransport({
      url: serverUrl(server),
      roomId: 'room-1',
      role: 'viewer',
      clientId: 'viewer-1',
      logger: { warn: (message) => warnings.push(message) },
    })
    client.onMessage((message) => messages.push(message))

    await client.start()

    await expect.poll(() => warnings).toEqual(['Discarded invalid signaling message: invalid-json'])
    expect(messages).toEqual([])
  })

  it('does not throw when sending before start', () => {
    client = new RelayClientTransport({
      url: 'ws://127.0.0.1:1',
      roomId: 'room-1',
      role: 'viewer',
      clientId: 'viewer-1',
    })

    expect(() => client?.send({ v: 1, t: 'ping' })).not.toThrow()
  })
})
