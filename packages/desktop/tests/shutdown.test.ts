import { afterEach, describe, expect, it, vi } from 'vitest'

import { runShutdownWithTimeout } from '../src/main/shutdown.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('runShutdownWithTimeout', () => {
  it('returns completed when cleanup finishes before timeout', async () => {
    await expect(
      runShutdownWithTimeout({
        runCleanups: async () => undefined,
        timeoutMs: 10,
      }),
    ).resolves.toBe('completed')
  })

  it('returns failed and logs cleanup errors', async () => {
    const logger = { error: vi.fn() }

    await expect(
      runShutdownWithTimeout({
        runCleanups: async () => {
          throw new Error('cleanup failed')
        },
        timeoutMs: 10,
        logger,
      }),
    ).resolves.toBe('failed')

    expect(logger.error).toHaveBeenCalledWith('Cleanup failed', expect.any(Error))
  })

  it('returns timed-out when cleanup hangs', async () => {
    vi.useFakeTimers()
    const logger = { error: vi.fn() }
    const result = runShutdownWithTimeout({
      runCleanups: () => new Promise(() => undefined),
      timeoutMs: 25,
      logger,
    })

    await vi.advanceTimersByTimeAsync(25)

    await expect(result).resolves.toBe('timed-out')
    expect(logger.error).toHaveBeenCalledWith('Cleanup timed out after 25ms')
  })
})
