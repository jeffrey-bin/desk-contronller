import { describe, expect, it } from 'vitest'

import { PROTOCOL_VERSION } from '../src/constants.js'
import { ErrorCode } from '../src/protocol/errors.js'
import { parseSignalingMessage } from '../src/protocol/signaling.js'

describe('signaling protocol', () => {
  it('accepts a valid hello', () => {
    const result = parseSignalingMessage({
      v: 1,
      t: 'hello',
      role: 'agent',
      clientId: 'agent-1',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects wrong protocol version', () => {
    expect(parseSignalingMessage({ v: 2, t: 'ping' }).ok).toBe(false)
  })

  it('rejects malformed pair-request', () => {
    expect(parseSignalingMessage({ v: 1, t: 'pair-request' }).ok).toBe(false)
  })

  it('accepts pair-request and pair-result messages', () => {
    expect(parseSignalingMessage({ v: 1, t: 'pair-request', code: 'ABC234' }).ok).toBe(true)
    expect(parseSignalingMessage({ v: 1, t: 'pair-result', ok: true }).ok).toBe(true)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'pair-result',
        ok: false,
        reason: ErrorCode.E_PAIR_INVALID_CODE,
      }).ok,
    ).toBe(true)
  })

  it('accepts WebRTC and lifecycle messages', () => {
    expect(parseSignalingMessage({ v: 1, t: 'offer', sdp: 'offer-sdp' }).ok).toBe(true)
    expect(parseSignalingMessage({ v: 1, t: 'answer', sdp: 'answer-sdp' }).ok).toBe(true)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'ice',
        candidate: {
          candidate: 'candidate',
          sdpMid: null,
          sdpMLineIndex: 0,
          usernameFragment: 'ufrag',
        },
      }).ok,
    ).toBe(true)
    expect(parseSignalingMessage({ v: 1, t: 'bye', reason: 'done' }).ok).toBe(true)
    expect(parseSignalingMessage({ v: 1, t: 'ping' }).ok).toBe(true)
    expect(parseSignalingMessage({ v: 1, t: 'pong' }).ok).toBe(true)
  })

  it('rejects invalid ICE sdpMLineIndex values', () => {
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'ice',
        candidate: {
          candidate: 'candidate',
          sdpMLineIndex: -1,
        },
      }).ok,
    ).toBe(false)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'ice',
        candidate: {
          candidate: 'candidate',
          sdpMLineIndex: 0.5,
        },
      }).ok,
    ).toBe(false)
  })

  it('accepts relay join-room messages without a protocol version bump', () => {
    expect(PROTOCOL_VERSION).toBe(1)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'join-room',
        roomId: 'room-1',
        role: 'agent',
        clientId: 'agent-1',
      }).ok,
    ).toBe(true)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'join-room',
        roomId: 'room-1',
        role: 'viewer',
        clientId: 'viewer-1',
      }).ok,
    ).toBe(true)
  })

  it('rejects malformed relay join-room messages', () => {
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'join-room',
        roomId: '',
        role: 'agent',
        clientId: 'agent-1',
      }).ok,
    ).toBe(false)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'join-room',
        roomId: 'room-1',
        role: 'operator',
        clientId: 'viewer-1',
      }).ok,
    ).toBe(false)
    expect(
      parseSignalingMessage({
        v: 1,
        t: 'join-room',
        roomId: 'room-1',
        role: 'viewer',
        clientId: '',
      }).ok,
    ).toBe(false)
  })
})
