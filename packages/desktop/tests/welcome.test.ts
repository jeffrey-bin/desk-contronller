import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IpcChannels } from '../src/main/ipc/channels.js'
import { registerWelcomeIpc } from '../src/main/ipc/welcome.js'
import type { AppMode } from '../src/main/mode.js'

const { registerHandler } = vi.hoisted(() => ({
  registerHandler: vi.fn(),
}))

vi.mock('../src/main/ipc/registry.js', () => ({
  registerHandler,
}))

type SelectableMode = Exclude<AppMode, 'welcome'>

type FakeStore = {
  set(key: 'mode', value: SelectableMode): void
}

describe('registerWelcomeIpc', () => {
  beforeEach(() => {
    registerHandler.mockReset()
  })

  it('persists selected mode after switching succeeds', async () => {
    const calls: string[] = []
    const store: FakeStore = {
      set: (_key, value) => {
        calls.push(`store:${value}`)
      },
    }
    const switchMode = vi.fn(async (mode: SelectableMode) => {
      calls.push(`switch:${mode}`)
    })

    registerWelcomeIpc({
      store: store as never,
      switchMode,
    })

    const handler = registerHandler.mock.calls[0]?.[1]
    expect(registerHandler.mock.calls[0]?.[0]).toBe(IpcChannels.welcomePickMode)
    await handler(undefined, 'agent')

    expect(calls).toEqual(['switch:agent', 'store:agent'])
  })

  it('does not persist selected mode when switching fails', async () => {
    const store: FakeStore = {
      set: vi.fn(),
    }
    const switchMode = vi.fn(async () => {
      throw new Error('switch failed')
    })

    registerWelcomeIpc({
      store: store as never,
      switchMode,
    })

    const handler = registerHandler.mock.calls[0]?.[1]
    await expect(handler(undefined, 'viewer')).rejects.toThrow('switch failed')

    expect(store.set).not.toHaveBeenCalled()
  })
})
