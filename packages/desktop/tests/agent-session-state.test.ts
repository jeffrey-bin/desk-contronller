import { ErrorCode } from '@desk/shared'
import { describe, expect, it, vi } from 'vitest'

import { AgentSessionStateMachine } from '../src/main/agent/session-state.js'

describe('AgentSessionStateMachine', () => {
  it('starts in pairing with a code from PairStore', () => {
    const session = new AgentSessionStateMachine()

    expect(session.state.phase).toBe('pairing')
    expect(session.state).toMatchObject({ attempts: 0 })
    expect(session.state.phase === 'pairing' ? session.state.code : '').toHaveLength(6)
  })

  it('rejects a wrong code, stays pairing, increments attempts, and emits changes', () => {
    const session = new AgentSessionStateMachine()
    const changes = vi.fn()
    session.onStateChange(changes)

    const result = session.handlePairRequest('viewer-1', 'WRONG1')

    expect(result).toEqual({
      v: 1,
      t: 'pair-result',
      ok: false,
      reason: ErrorCode.E_PAIR_INVALID_CODE,
    })
    expect(session.state).toMatchObject({ phase: 'pairing', attempts: 1 })
    expect(changes).toHaveBeenCalledWith(session.state)
  })

  it('accepts the right code and moves connecting', () => {
    const session = new AgentSessionStateMachine()
    const code = session.state.phase === 'pairing' ? session.state.code : ''

    const result = session.handlePairRequest('viewer-1', code)

    expect(result).toEqual({ v: 1, t: 'pair-result', ok: true })
    expect(session.state).toEqual({ phase: 'connecting', viewerId: 'viewer-1' })
  })

  it('rejects pair requests while busy', () => {
    const session = new AgentSessionStateMachine()
    const code = session.state.phase === 'pairing' ? session.state.code : ''
    session.handlePairRequest('viewer-1', code)

    expect(session.handlePairRequest('viewer-2', code)).toEqual({
      v: 1,
      t: 'pair-result',
      ok: false,
      reason: ErrorCode.E_PEER_BUSY,
    })
  })

  it('moves connecting to active when peer connects', () => {
    const now = vi.fn(() => 42)
    const session = new AgentSessionStateMachine({ now })
    const code = session.state.phase === 'pairing' ? session.state.code : ''
    session.handlePairRequest('viewer-1', code)

    session.peerConnected()

    expect(session.state).toEqual({ phase: 'active', viewerId: 'viewer-1', since: 42 })
  })

  it('moves active through disconnecting then pairing on cleanup', () => {
    const session = new AgentSessionStateMachine()
    const code = session.state.phase === 'pairing' ? session.state.code : ''
    session.handlePairRequest('viewer-1', code)
    session.peerConnected()

    session.disconnect('user-stop')
    expect(session.state).toEqual({ phase: 'disconnecting', reason: 'user-stop' })

    session.cleanupComplete()
    expect(session.state.phase).toBe('pairing')
  })

  it('returns connecting to pairing on ICE failure', () => {
    const session = new AgentSessionStateMachine()
    const code = session.state.phase === 'pairing' ? session.state.code : ''
    session.handlePairRequest('viewer-1', code)

    session.fail(ErrorCode.E_ICE_FAILED)

    expect(session.state.phase).toBe('pairing')
  })
})
