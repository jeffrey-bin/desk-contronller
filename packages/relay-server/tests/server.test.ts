import type { SignalingMessage } from '@desk/shared'
import { ErrorCode } from '@desk/shared'
import { decodeMessage, encodeMessage } from '@desk/signaling'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

import { RelayServer } from '../src/server.js'

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
}

function onceClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once('close', resolve)
  })
}

function onceDecoded(socket: WebSocket): Promise<SignalingMessage> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      const decoded = decodeMessage(data.toString())
      if (decoded.ok) {
        resolve(decoded.value)
        return
      }
      reject(new Error(decoded.reason))
    })
  })
}

async function connectPeer(
  server: RelayServer,
  role: 'agent' | 'viewer',
  clientId: string = role,
  roomId: string = 'room-1',
): Promise<WebSocket> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`)
  await onceOpen(socket)
  socket.send(encodeMessage({ v: 1, t: 'join-room', roomId, role, clientId }))
  return socket
}

describe('RelayServer', () => {
  let server: RelayServer | undefined

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it('starts on an ephemeral port', async () => {
    server = new RelayServer({ host: '127.0.0.1', port: 0 })

    await server.start()

    expect(server.port).toBeGreaterThan(0)
  })

  it('routes signaling messages between one Agent and one Viewer in a room', async () => {
    server = new RelayServer({ host: '127.0.0.1', port: 0 })
    await server.start()
    const agent = await connectPeer(server, 'agent', 'agent-1')
    const viewer = await connectPeer(server, 'viewer', 'viewer-1')

    const pairRequest = { v: 1, t: 'pair-request', code: 'ABC234' } as const
    const offer = { v: 1, t: 'offer', sdp: 'offer-sdp' } as const
    const viewerMessage = onceDecoded(viewer)
    agent.send(encodeMessage(offer))
    await expect(viewerMessage).resolves.toEqual(offer)

    const agentMessage = onceDecoded(agent)
    viewer.send(encodeMessage(pairRequest))
    await expect(agentMessage).resolves.toEqual(pairRequest)

    agent.close()
    viewer.close()
    await Promise.all([onceClose(agent), onceClose(viewer)])
  })

  it('rejects a second peer with the same role in a room', async () => {
    server = new RelayServer({ host: '127.0.0.1', port: 0 })
    await server.start()
    const firstAgent = await connectPeer(server, 'agent', 'agent-1')
    const secondAgent = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await onceOpen(secondAgent)
    const busy = onceDecoded(secondAgent)

    secondAgent.send(
      encodeMessage({ v: 1, t: 'join-room', roomId: 'room-1', role: 'agent', clientId: 'agent-2' }),
    )

    await expect(busy).resolves.toEqual({ v: 1, t: 'bye', reason: ErrorCode.E_PEER_BUSY })
    await onceClose(secondAgent)
    expect(firstAgent.readyState).toBe(WebSocket.OPEN)

    firstAgent.close()
    await onceClose(firstAgent)
  })

  it('removes closed peers from rooms and allows replacement', async () => {
    server = new RelayServer({ host: '127.0.0.1', port: 0 })
    await server.start()
    const agent = await connectPeer(server, 'agent', 'agent-1')
    agent.close()
    await onceClose(agent)

    const replacement = await connectPeer(server, 'agent', 'agent-2')

    expect(replacement.readyState).toBe(WebSocket.OPEN)
    replacement.close()
    await onceClose(replacement)
  })

  it('drops invalid messages without throwing', async () => {
    const warnings: string[] = []
    server = new RelayServer({
      host: '127.0.0.1',
      port: 0,
      logger: { warn: (message) => warnings.push(message) },
    })
    await server.start()
    const agent = await connectPeer(server, 'agent', 'agent-1')

    agent.send('{nope')

    await expect.poll(() => warnings).toEqual(['Discarded invalid relay message: invalid-json'])
    expect(agent.readyState).toBe(WebSocket.OPEN)

    agent.close()
    await onceClose(agent)
  })
})
