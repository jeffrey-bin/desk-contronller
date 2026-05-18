import { describe, expect, it, vi } from 'vitest'

import { AgentPeerSessionManager } from '../src/shared/agent-peer-session.js'

describe('AgentPeerSessionManager', () => {
  it('stops captured stream and reports failure when controller creation fails', async () => {
    const stream = { id: 'stream' }
    const stopStream = vi.fn()
    const reportPeerConnectionState = vi.fn()
    const manager = new AgentPeerSessionManager({
      capture: vi.fn(async () => stream),
      createController: vi.fn(async () => {
        throw new Error('pc failed')
      }),
      stopStream,
      reportPeerConnectionState,
    })

    await manager.start()

    expect(stopStream).toHaveBeenCalledWith(stream)
    expect(reportPeerConnectionState).toHaveBeenCalledWith('failed')
  })

  it('does not keep a controller created after a newer stop', async () => {
    type Controller = { stop: ReturnType<typeof vi.fn> }
    const controller: Controller = { stop: vi.fn() }
    let resolveController: ((controller: Controller) => void) | undefined
    const stream = { id: 'stream' }
    const stopStream = vi.fn()
    const manager = new AgentPeerSessionManager({
      capture: vi.fn(async () => stream),
      createController: vi.fn(
        () =>
          new Promise<typeof controller>((resolve) => {
            resolveController = resolve
          }),
      ),
      stopStream,
      reportPeerConnectionState: vi.fn(),
    })

    const started = manager.start()
    await Promise.resolve()
    manager.stop()
    resolveController?.(controller)
    await started
    manager.stop()

    expect(controller.stop).toHaveBeenCalledTimes(1)
    expect(stopStream).toHaveBeenCalledWith(stream)
  })

  it('does not report stale startup failures after stop', async () => {
    let rejectCapture: ((error: Error) => void) | undefined
    const reportPeerConnectionState = vi.fn()
    const manager = new AgentPeerSessionManager({
      capture: vi.fn(
        () =>
          new Promise<unknown>((_resolve, reject) => {
            rejectCapture = reject
          }),
      ),
      createController: vi.fn(async () => ({ stop: vi.fn() })),
      stopStream: vi.fn(),
      reportPeerConnectionState,
    })

    const started = manager.start()
    manager.stop()
    rejectCapture?.(new Error('capture failed'))
    await started

    expect(reportPeerConnectionState).not.toHaveBeenCalled()
  })
})
