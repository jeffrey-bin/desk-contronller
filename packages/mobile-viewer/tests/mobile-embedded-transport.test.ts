import { PROTOCOL_VERSION } from '@desk/shared'
import { describe, expect, it } from 'vitest'

import { MobileEmbeddedTransport } from '../src/embedded-transport.js'

type Listener = () => void

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = []

  readonly sent: string[] = []
  readonly #listeners = new Map<string, Listener[]>()
  readyState: number = WebSocket.CONNECTING

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: 'open', listener: Listener, options?: { once?: boolean }): void
  addEventListener(
    type: 'message',
    listener: (event: { data?: unknown }) => void,
    options?: { once?: boolean },
  ): void
  addEventListener(type: 'close' | 'error', listener: Listener, options?: { once?: boolean }): void
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: Listener | ((event: { data?: unknown }) => void),
  ): void {
    const listeners = this.#listeners.get(type) ?? []
    listeners.push(listener as Listener)
    this.#listeners.set(type, listeners)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = WebSocket.CLOSED
  }

  open(): void {
    this.readyState = WebSocket.OPEN
    for (const listener of this.#listeners.get('open') ?? []) {
      listener()
    }
  }
}

describe('MobileEmbeddedTransport', () => {
  it('opens a direct Agent connection with a hello handshake', async () => {
    FakeWebSocket.instances.length = 0

    const transport = new MobileEmbeddedTransport({
      url: 'ws://127.0.0.1:49830',
      role: 'viewer',
      clientId: 'rn-viewer-1',
      webSocketCtor: FakeWebSocket,
    })

    const start = transport.start()
    const socket = FakeWebSocket.instances[0]
    expect(socket?.url).toBe('ws://127.0.0.1:49830')

    socket?.open()
    await start

    expect(socket?.sent.map((message) => JSON.parse(message))).toEqual([
      {
        v: PROTOCOL_VERSION,
        t: 'hello',
        role: 'viewer',
        clientId: 'rn-viewer-1',
      },
    ])
  })
})
