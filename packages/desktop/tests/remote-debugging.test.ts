import { describe, expect, it, vi } from 'vitest'

import { configureRemoteDebugging } from '../src/main/remote-debugging.js'

describe('configureRemoteDebugging', () => {
  it('passes REMOTE_DEBUGGING_PORT to Electron command line', () => {
    const commandLine = { appendSwitch: vi.fn() }

    configureRemoteDebugging(commandLine, { REMOTE_DEBUGGING_PORT: '54545' })

    expect(commandLine.appendSwitch).toHaveBeenCalledWith('remote-debugging-port', '54545')
  })

  it('ignores missing REMOTE_DEBUGGING_PORT', () => {
    const commandLine = { appendSwitch: vi.fn() }

    configureRemoteDebugging(commandLine, {})

    expect(commandLine.appendSwitch).not.toHaveBeenCalled()
  })
})
