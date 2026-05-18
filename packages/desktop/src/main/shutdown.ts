import { QUIT_CLEANUP_TIMEOUT_MS } from '@desk/shared'

export type ShutdownResult = 'completed' | 'failed' | 'timed-out'

export type ShutdownLogger = {
  error(message: string, error?: unknown): void
}

export async function runShutdownWithTimeout(options: {
  runCleanups(): Promise<void>
  timeoutMs?: number
  logger?: ShutdownLogger
}): Promise<ShutdownResult> {
  const timeoutMs = options.timeoutMs ?? QUIT_CLEANUP_TIMEOUT_MS
  let timedOut = false
  const cleanupTimeout = createTimeout(timeoutMs)
  const cleanup = options.runCleanups()
  cleanup.catch((error: unknown) => {
    if (timedOut) {
      options.logger?.error('Cleanup failed after timeout', error)
    }
  })

  try {
    const result = await Promise.race([
      cleanup.then(() => 'completed' as const),
      cleanupTimeout.promise.then(() => 'timed-out' as const),
    ])
    cleanupTimeout.cancel()

    if (result === 'timed-out') {
      timedOut = true
      options.logger?.error(`Cleanup timed out after ${timeoutMs}ms`)
    }

    return result
  } catch (error) {
    cleanupTimeout.cancel()
    options.logger?.error('Cleanup failed', error)
    return 'failed'
  }
}

function createTimeout(ms: number): { promise: Promise<void>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    promise: new Promise((resolve) => {
      timer = setTimeout(resolve, ms)
    }),
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    },
  }
}
