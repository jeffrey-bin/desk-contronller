import { describe, expect, it, vi } from 'vitest'

import { MobileViewerSession, type MobileViewerState } from '../src/mobile-viewer-session.js'

describe('MobileViewerSession', () => {
  it('notifies subscribers when state and stream change', async () => {
    const messages: ((
      message: { v: 1; t: 'pair-result'; ok: true } | { v: 1; t: 'offer'; sdp: string },
    ) => void)[] = []
    const states: MobileViewerState[] = []
    const transport = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      send: vi.fn(),
      onMessage: vi.fn(
        (
          handler: (
            message: { v: 1; t: 'pair-result'; ok: true } | { v: 1; t: 'offer'; sdp: string },
          ) => void,
        ) => {
          messages.push(handler)
          return () => undefined
        },
      ),
      onConnectionState: vi.fn(() => () => undefined),
    }
    const peer = {
      acceptOffer: vi.fn(async () => ({
        answerSdp: 'answer-sdp',
        stream: { id: 'native-stream', videoTracks: 1 },
      })),
      addIceCandidate: vi.fn(async () => undefined),
    }
    const session = new MobileViewerSession({ transport, peer })

    session.onChange((snapshot) => {
      states.push(snapshot.state)
    })

    await session.connect('ABC123')
    messages[0]?.({ v: 1, t: 'pair-result', ok: true })
    messages[0]?.({ v: 1, t: 'offer', sdp: 'offer-sdp' })

    await vi.waitFor(() =>
      expect(states).toEqual(['pairing', 'negotiating', 'negotiating', 'streaming']),
    )
    expect(session.stream).toEqual({ id: 'native-stream', videoTracks: 1 })
    expect(peer.acceptOffer).toHaveBeenCalledWith('offer-sdp', expect.any(Function))
    expect(transport.send).toHaveBeenCalledWith({ v: 1, t: 'answer', sdp: 'answer-sdp' })
  })
})
