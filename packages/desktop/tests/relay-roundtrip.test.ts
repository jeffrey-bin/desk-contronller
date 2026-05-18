import { type SignalingMessage } from '@desk/shared'
import { RelayServer } from '@desk/relay-server'
import { afterEach, describe, expect, it } from 'vitest'

import { RelayClientTransport } from '../src/main/signaling/relay-client.js'

describe('relay roundtrip integration', () => {
  let server: RelayServer | undefined
  let agent: RelayClientTransport | undefined
  let viewer: RelayClientTransport | undefined

  afterEach(async () => {
    await viewer?.stop()
    await agent?.stop()
    await server?.stop()
    viewer = undefined
    agent = undefined
    server = undefined
  })

  it('routes the M2 signaling flow through RelayServer and RelayClientTransport', async () => {
    server = new RelayServer({ host: '127.0.0.1', port: 0 })
    await server.start()

    const url = `ws://127.0.0.1:${server.port}`
    const agentMessages: SignalingMessage[] = []
    const viewerMessages: SignalingMessage[] = []

    agent = new RelayClientTransport({
      url,
      roomId: 'room-1',
      role: 'agent',
      clientId: 'agent-1',
    })
    viewer = new RelayClientTransport({
      url,
      roomId: 'room-1',
      role: 'viewer',
      clientId: 'viewer-1',
    })
    agent.onMessage((message) => agentMessages.push(message))
    viewer.onMessage((message) => viewerMessages.push(message))

    await Promise.all([agent.start(), viewer.start()])
    await waitForRoute(viewer, agentMessages)
    agentMessages.length = 0
    const agentFlow = (): SignalingMessage[] =>
      agentMessages.filter((message) => message.t !== 'ping')

    const pairRequest = { v: 1, t: 'pair-request', code: '123456' } as const
    viewer.send(pairRequest)
    await expect.poll(agentFlow).toEqual([pairRequest])

    const offer = { v: 1, t: 'offer', sdp: 'offer-sdp' } as const
    agent.send(offer)
    await expect.poll(() => viewerMessages).toEqual([offer])

    const answer = { v: 1, t: 'answer', sdp: 'answer-sdp' } as const
    viewer.send(answer)
    await expect.poll(agentFlow).toEqual([pairRequest, answer])

    const ice = {
      v: 1,
      t: 'ice',
      candidate: {
        candidate: 'candidate:1 1 udp 1 127.0.0.1 123 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    } as const
    agent.send(ice)
    await expect.poll(() => viewerMessages).toEqual([offer, ice])

    const bye = { v: 1, t: 'bye', reason: 'done' } as const
    viewer.send(bye)
    await expect.poll(agentFlow).toEqual([pairRequest, answer, bye])
  })
})

async function waitForRoute(
  source: RelayClientTransport,
  targetMessages: SignalingMessage[],
): Promise<void> {
  const probe = { v: 1, t: 'ping' } as const

  await expect
    .poll(
      () => {
        source.send(probe)
        return targetMessages.length
      },
      { interval: 20 },
    )
    .toBeGreaterThan(0)
}
