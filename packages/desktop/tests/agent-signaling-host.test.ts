import type { SignalingMessage } from '@desk/shared'
import { ErrorCode } from '@desk/shared'
import { describe, expect, it, vi } from 'vitest'

import { AgentSessionStateMachine } from '../src/main/agent/session-state.js'
import { AgentSignalingHost } from '../src/main/agent/signaling-host.js'

class FakeTransport {
  readonly sent: SignalingMessage[] = []
  readonly messageHandlers = new Set<(message: SignalingMessage) => void>()
  readonly stateHandlers = new Set<(state: 'open' | 'closed' | 'error') => void>()
  port = 4567
  started = false
  stopped = false

  async start(): Promise<void> {
    this.started = true
  }

  async stop(): Promise<void> {
    this.stopped = true
  }

  send(message: SignalingMessage): void {
    this.sent.push(message)
  }

  onMessage(handler: (message: SignalingMessage) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onConnectionState(handler: (state: 'open' | 'closed' | 'error') => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  emit(message: SignalingMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message)
    }
  }

  emitState(state: 'open' | 'closed' | 'error'): void {
    for (const handler of this.stateHandlers) {
      handler(state)
    }
  }
}

describe('AgentSignalingHost', () => {
  it('starts transport and exposes selected port', async () => {
    const transport = new FakeTransport()
    const host = new AgentSignalingHost({
      session: new AgentSessionStateMachine(),
      createTransport: () => transport,
    })

    await host.start()

    expect(transport.started).toBe(true)
    expect(host.port).toBe(4567)
  })

  it('handles pair-request and calls accepted callback', async () => {
    const transport = new FakeTransport()
    const session = new AgentSessionStateMachine()
    const code = session.state.phase === 'pairing' ? session.state.code : ''
    const onPairAccepted = vi.fn()
    const host = new AgentSignalingHost({
      session,
      createTransport: () => transport,
      callbacks: { onPairAccepted },
    })
    await host.start()

    transport.emit({ v: 1, t: 'hello', role: 'viewer', clientId: 'viewer-1' })
    transport.emit({ v: 1, t: 'pair-request', code })

    expect(transport.sent).toContainEqual({ v: 1, t: 'pair-result', ok: true })
    expect(onPairAccepted).toHaveBeenCalledWith('viewer-1')
  })

  it('forwards non-pair messages to callbacks and replies to ping', async () => {
    const transport = new FakeTransport()
    const onAnswer = vi.fn()
    const onIce = vi.fn()
    const onBye = vi.fn()
    const host = new AgentSignalingHost({
      session: new AgentSessionStateMachine(),
      createTransport: () => transport,
      callbacks: { onAnswer, onIce, onBye },
    })
    await host.start()

    const answer = { v: 1, t: 'answer', sdp: 'sdp' } as const
    const ice = { v: 1, t: 'ice', candidate: { candidate: 'c' } } as const
    const bye = { v: 1, t: 'bye', reason: 'viewer-left' } as const
    transport.emit(answer)
    transport.emit(ice)
    transport.emit(bye)
    transport.emit({ v: 1, t: 'ping' })

    expect(onAnswer).toHaveBeenCalledWith(answer)
    expect(onIce).toHaveBeenCalledWith(ice)
    expect(onBye).toHaveBeenCalledWith(bye)
    expect(transport.sent).toContainEqual({ v: 1, t: 'pong' })
  })

  it('rejects pair-request without hello as busy', async () => {
    const transport = new FakeTransport()
    const host = new AgentSignalingHost({
      session: new AgentSessionStateMachine(),
      createTransport: () => transport,
    })
    await host.start()

    transport.emit({ v: 1, t: 'pair-request', code: 'ABCDEF' })

    expect(transport.sent).toEqual([
      { v: 1, t: 'pair-result', ok: false, reason: ErrorCode.E_PEER_BUSY },
    ])
  })

  it('notifies close/error after a paired viewer so session can clean up', async () => {
    const transport = new FakeTransport()
    const session = new AgentSessionStateMachine()
    const code = session.state.phase === 'pairing' ? session.state.code : ''
    const onConnectionLost = vi.fn()
    const host = new AgentSignalingHost({
      session,
      createTransport: () => transport,
      callbacks: { onConnectionLost },
    })
    await host.start()
    transport.emit({ v: 1, t: 'hello', role: 'viewer', clientId: 'viewer-1' })
    transport.emit({ v: 1, t: 'pair-request', code })

    transport.emitState('closed')

    expect(onConnectionLost).toHaveBeenCalledWith('viewer-1', 'closed')
  })
})
