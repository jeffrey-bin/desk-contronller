import type { SignalingMessage } from '@desk/shared'
import { WebSocketServer } from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

import { EmbeddedClientTransport } from '../src/main/signaling/embedded-client.js'
import { EmbeddedServerTransport } from '../src/main/signaling/embedded-server.js'

describe('EmbeddedClientTransport', () => {
  let client: EmbeddedClientTransport | undefined
  let server: EmbeddedServerTransport | undefined

  afterEach(async () => {
    await client?.stop()
    await server?.stop()
    client = undefined
    server = undefined
  })

  it('connects to an embedded server and exchanges messages both directions', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    const serverMessages: SignalingMessage[] = []
    const clientMessages: SignalingMessage[] = []

    server.onMessage((message) => serverMessages.push(message))
    await server.start()

    client = new EmbeddedClientTransport({ host: '127.0.0.1', port: server.port })
    client.onMessage((message) => clientMessages.push(message))
    await client.start()

    const ping = { v: 1, t: 'ping' } as const
    const pong = { v: 1, t: 'pong' } as const

    client.send(ping)
    await expect.poll(() => serverMessages).toEqual([ping])

    server.send(pong)
    await expect.poll(() => clientMessages).toEqual([pong])
  })

  it('emits closed when the server stops', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()

    const states: string[] = []
    client = new EmbeddedClientTransport({ host: '127.0.0.1', port: server.port })
    client.onConnectionState((state) => states.push(state))
    await client.start()

    await expect.poll(() => states).toEqual(['open'])

    await server.stop()

    await expect.poll(() => states).toEqual(['open', 'closed'])
  })

  it('emits error and rejects when connection fails', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()
    const port = server.port
    await server.stop()
    server = undefined

    const states: string[] = []
    client = new EmbeddedClientTransport({ host: '127.0.0.1', port })
    client.onConnectionState((state) => states.push(state))

    await expect(client.start()).rejects.toThrow()
    expect(states).toContain('error')
  })

  it('returns the same promise for concurrent starts while connecting', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    let openCount = 0

    server.onConnectionState((state) => {
      if (state === 'open') {
        openCount += 1
      }
    })
    await server.start()

    client = new EmbeddedClientTransport({ host: '127.0.0.1', port: server.port })
    const firstStart = client.start()
    const secondStart = client.start()

    expect(secondStart).toBe(firstStart)

    await Promise.all([firstStart, secondStart])
    await expect.poll(() => openCount).toBe(1)
  })

  it('emits closed once when stopped after opening', async () => {
    server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()

    const states: string[] = []
    client = new EmbeddedClientTransport({ host: '127.0.0.1', port: server.port })
    client.onConnectionState((state) => states.push(state))
    await client.start()
    await client.stop()

    expect(states).toEqual(['open', 'closed'])
  })

  it('warns and discards invalid inbound messages', async () => {
    const rawServer = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>((resolve, reject) => {
      rawServer.once('listening', resolve)
      rawServer.once('error', reject)
    })

    const warnings: string[] = []
    const messages: SignalingMessage[] = []
    const address = rawServer.address()

    if (typeof address !== 'object' || address === null) {
      throw new Error('Expected raw server address')
    }

    client = new EmbeddedClientTransport({
      host: '127.0.0.1',
      port: address.port,
      logger: { warn: (message) => warnings.push(message) },
    })
    client.onMessage((message) => messages.push(message))
    rawServer.once('connection', (socket) => socket.send('{nope'))

    await client.start()

    await expect.poll(() => warnings).toEqual(['Discarded invalid signaling message: invalid-json'])
    expect(messages).toEqual([])

    rawServer.close()
  })

  it('does not throw when sending before start', () => {
    client = new EmbeddedClientTransport({ host: '127.0.0.1', port: 1 })

    expect(() => client?.send({ v: 1, t: 'ping' })).not.toThrow()
  })
})
