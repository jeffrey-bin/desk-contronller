import { PROTOCOL_VERSION, type SignalingMessage } from '@desk/shared'
import { RelayServer } from '@desk/relay-server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MobileViewerSession } from '../src/mobile-viewer-session.js'
import { MobileRelayTransport } from '../src/relay-transport.js'

const runningServers: RelayServer[] = []

describe('mobile Viewer M2 main link', () => {
  afterEach(async () => {
    await Promise.all(runningServers.splice(0).map((server) => server.stop()))
  })

  it('pairs through relay, answers an Agent offer, applies ICE, and exposes a remote stream', async () => {
    const relay = new RelayServer({ host: '127.0.0.1', port: 0 })
    runningServers.push(relay)
    await relay.start()

    const url = `ws://127.0.0.1:${relay.port}`
    const roomId = 'ROOM42'
    const agent = new MobileRelayTransport({
      url,
      roomId,
      role: 'agent',
      clientId: 'agent-1',
    })
    const viewer = new MobileRelayTransport({
      url,
      roomId,
      role: 'viewer',
      clientId: 'rn-viewer-1',
    })
    const agentMessages: SignalingMessage[] = []
    agent.onMessage((message) => agentMessages.push(message))

    const peer = {
      acceptOffer: vi.fn(async (sdp: string) => ({
        answerSdp: `answer-for:${sdp}`,
        stream: { id: 'rn-remote-stream', videoTracks: 1 },
      })),
      addIceCandidate: vi.fn(async () => undefined),
    }
    const session = new MobileViewerSession({ transport: viewer, peer })

    await agent.start()
    await session.connect('ABC123')
    await vi.waitFor(() =>
      expect(agentMessages).toContainEqual({
        v: PROTOCOL_VERSION,
        t: 'pair-request',
        code: 'ABC123',
      }),
    )

    agent.send({ v: PROTOCOL_VERSION, t: 'pair-result', ok: true })
    agent.send({ v: PROTOCOL_VERSION, t: 'offer', sdp: 'agent-offer-sdp' })
    agent.send({
      v: PROTOCOL_VERSION,
      t: 'ice',
      candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' },
    })

    await vi.waitFor(() => expect(session.state).toBe('streaming'))
    expect(peer.acceptOffer).toHaveBeenCalledWith('agent-offer-sdp', expect.any(Function))
    expect(peer.addIceCandidate).toHaveBeenCalledWith({
      candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host',
    })
    expect(session.stream).toEqual({ id: 'rn-remote-stream', videoTracks: 1 })
    expect(agentMessages).toContainEqual({
      v: PROTOCOL_VERSION,
      t: 'answer',
      sdp: 'answer-for:agent-offer-sdp',
    })

    await session.disconnect()
    await agent.stop()
  })
})
