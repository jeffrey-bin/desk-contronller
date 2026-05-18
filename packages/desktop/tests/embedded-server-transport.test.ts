import type { SignalingMessage } from '@desk/shared'
import { ErrorCode } from '@desk/shared'
import { decodeMessage, encodeMessage } from '@desk/signaling'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

import { EmbeddedServerTransport } from '../src/main/signaling/embedded-server.js'

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

describe('EmbeddedServerTransport', () => {
  let server: EmbeddedServerTransport | undefined

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it('starts, exposes a port, accepts one client, and sends messages', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    const messages: SignalingMessage[] = []

    server.onMessage((message) => messages.push(message))
    await server.start()

    expect(server.port).toBeGreaterThan(0)

    const client = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await onceOpen(client)

    const ping = { v: 1, t: 'ping' } as const
    client.send(encodeMessage(ping))

    await expect.poll(() => messages).toEqual([ping])

    const pong = { v: 1, t: 'pong' } as const
    const received = onceDecoded(client)
    server.send(pong)

    await expect(received).resolves.toEqual(pong)

    client.close()
    await onceClose(client)
  })

  it('rejects a second concurrent client with peer-busy bye', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()

    const first = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await onceOpen(first)

    const second = new WebSocket(`ws://127.0.0.1:${server.port}`)
    const busy = onceDecoded(second)
    await onceOpen(second)

    await expect(busy).resolves.toEqual({ v: 1, t: 'bye', reason: ErrorCode.E_PEER_BUSY })
    await onceClose(second)

    expect(first.readyState).toBe(WebSocket.OPEN)

    first.close()
    await onceClose(first)
  })

  it('emits state transitions', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    const states: string[] = []

    server.onConnectionState((state) => states.push(state))
    await server.start()

    const client = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await onceOpen(client)

    await expect.poll(() => states).toEqual(['open'])

    client.close()
    await onceClose(client)

    await expect.poll(() => states).toEqual(['open', 'closed'])
  })

  it('warns and discards invalid inbound messages', async () => {
    const warnings: string[] = []
    const messages: SignalingMessage[] = []
    server = new EmbeddedServerTransport({
      host: '127.0.0.1',
      port: 0,
      logger: { warn: (message) => warnings.push(message) },
    })
    server.onMessage((message) => messages.push(message))
    await server.start()

    const client = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await onceOpen(client)

    client.send('{nope')

    await expect.poll(() => warnings).toEqual(['Discarded invalid signaling message: invalid-json'])
    expect(messages).toEqual([])

    client.close()
    await onceClose(client)
  })

  it('can retry start after a bind failure', async () => {
    const holder = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await holder.start()

    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: holder.port })

    await expect(server.start()).rejects.toThrow()

    await holder.stop()
    await server.start()

    expect(server.port).toBeGreaterThan(0)
  })
})
