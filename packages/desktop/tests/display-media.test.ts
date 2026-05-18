import { describe, expect, it, vi } from 'vitest'

import {
  choosePrimaryScreenSource,
  configureDisplayMediaRequestHandler,
} from '../src/main/agent/display-media.js'

describe('display media request handler', () => {
  it('grants the primary screen source to getDisplayMedia requests', async () => {
    let handler:
      | Parameters<
          Parameters<typeof configureDisplayMediaRequestHandler>[0]['setDisplayMediaRequestHandler']
        >[0]
      | undefined
    const session = {
      setDisplayMediaRequestHandler: vi.fn((nextHandler) => {
        handler = nextHandler
      }),
    }
    const screenSource = {
      id: 'screen:1:0',
      name: 'Entire Screen',
      display_id: '1',
      thumbnail: {},
    }
    const capturer = {
      getSources: vi.fn(async () => [screenSource]),
    }
    const callback = vi.fn()

    configureDisplayMediaRequestHandler(session, capturer)
    handler?.({}, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(capturer.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    })
    expect(callback).toHaveBeenCalledWith({
      video: screenSource,
    })
  })

  it('warns and denies the request when no screen source is available', async () => {
    let handler:
      | Parameters<
          Parameters<typeof configureDisplayMediaRequestHandler>[0]['setDisplayMediaRequestHandler']
        >[0]
      | undefined
    const session = {
      setDisplayMediaRequestHandler: vi.fn((nextHandler) => {
        handler = nextHandler
      }),
    }
    const capturer = { getSources: vi.fn(async () => []) }
    const logger = { warn: vi.fn() }
    const callback = vi.fn()

    configureDisplayMediaRequestHandler(session, capturer, logger)
    handler?.({}, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(callback).toHaveBeenCalledWith({})
    expect(logger.warn).toHaveBeenCalledWith(
      'No screen source available for display capture; sourceCount=0',
    )
  })

  it('uses an explicit fallback source when automation cannot enumerate screens', async () => {
    let handler:
      | Parameters<
          Parameters<typeof configureDisplayMediaRequestHandler>[0]['setDisplayMediaRequestHandler']
        >[0]
      | undefined
    const session = {
      setDisplayMediaRequestHandler: vi.fn((nextHandler) => {
        handler = nextHandler
      }),
    }
    const capturer = { getSources: vi.fn(async () => []) }
    const logger = { warn: vi.fn() }
    const callback = vi.fn()
    const fallbackSource = { id: 'screen:1:0', name: 'Entire Screen' }

    configureDisplayMediaRequestHandler(session, capturer, logger, { fallbackSource })
    handler?.({}, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(callback).toHaveBeenCalledWith({ video: fallbackSource })
    expect(logger.warn).toHaveBeenCalledWith(
      'No screen source available for display capture; using fallback source screen:1:0',
    )
  })

  it('chooses the first screen source returned by Electron', () => {
    expect(
      choosePrimaryScreenSource([
        { id: 'screen:1:0', name: 'Screen 1' },
        { id: 'screen:2:0', name: 'Screen 2' },
      ]),
    ).toEqual({ id: 'screen:1:0', name: 'Screen 1' })
  })
})
