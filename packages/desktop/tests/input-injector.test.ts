import { describe, expect, it, vi } from 'vitest'

import { InputInjector } from '../src/main/agent/input-injector.js'

const v = 1 as const

describe('InputInjector', () => {
  it('maps normalized mouse coordinates and buttons to driver calls', async () => {
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(),
      buttonUp: vi.fn(),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
    }
    const injector = new InputInjector({ driver })

    await injector.handleMouse({ v, t: 'md', x: 0.5, y: 0.25, b: 2 }, { width: 200, height: 100 })
    await injector.handleMouse(
      { v, t: 'mw', x: 0, y: 0, dx: 0, dy: 3 },
      { width: 200, height: 100 },
    )

    expect(driver.move).toHaveBeenCalledWith({ x: 100, y: 25 })
    expect(driver.buttonDown).toHaveBeenCalledWith('right')
    expect(driver.scroll).toHaveBeenCalledWith(0, 3)
  })

  it('tracks keyboard down/up, sync releases missing keys, and releaseAll clears state', async () => {
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(),
      buttonUp: vi.fn(),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
    }
    const injector = new InputInjector({ driver })

    await injector.handleKey({ v, t: 'kd', code: 'KeyA', mods: 1 })
    await injector.handleKey({ v, t: 'kd', code: 'KeyB', mods: 1 })
    await injector.handleKey({ v, t: 'sync', mods: 0, keys: ['KeyB'] })
    await injector.releaseAll()

    expect(driver.keyDown).toHaveBeenCalledWith('KeyA')
    expect(driver.keyDown).toHaveBeenCalledWith('KeyB')
    expect(driver.keyUp).toHaveBeenCalledWith('KeyA')
    expect(driver.keyUp).toHaveBeenCalledWith('KeyB')
  })

  it('releases pressed mouse buttons during releaseAll', async () => {
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(),
      buttonUp: vi.fn(),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
    }
    const injector = new InputInjector({ driver })

    await injector.handleMouse({ v, t: 'md', x: 0.1, y: 0.2, b: 0 }, { width: 100, height: 100 })
    await injector.handleMouse({ v, t: 'md', x: 0.1, y: 0.2, b: 2 }, { width: 100, height: 100 })
    await injector.releaseAll()
    await injector.releaseAll()

    expect(driver.buttonUp).toHaveBeenCalledWith('left')
    expect(driver.buttonUp).toHaveBeenCalledWith('right')
    expect(driver.buttonUp).toHaveBeenCalledTimes(2)
  })

  it('validates keys before tracking pressed state', async () => {
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(),
      buttonUp: vi.fn(),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
      validateKey: vi.fn(() => {
        throw new Error('bad key')
      }),
    }
    const injector = new InputInjector({ driver })

    await expect(injector.handleKey({ v, t: 'kd', code: 'Nope', mods: 0 })).rejects.toThrow(
      'bad key',
    )
    await injector.releaseAll()

    expect(driver.keyDown).not.toHaveBeenCalled()
    expect(driver.keyUp).not.toHaveBeenCalled()
  })

  it('continues releaseAll after individual release failures and retries failed releases', async () => {
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(),
      buttonUp: vi.fn(async (button: string) => {
        if (button === 'left') {
          throw new Error('left stuck')
        }
      }),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(async (code: string) => {
        if (code === 'KeyA') {
          throw new Error('a stuck')
        }
      }),
    }
    const injector = new InputInjector({ driver })
    await injector.handleMouse({ v, t: 'md', x: 0, y: 0, b: 0 }, { width: 100, height: 100 })
    await injector.handleMouse({ v, t: 'md', x: 0, y: 0, b: 2 }, { width: 100, height: 100 })
    await injector.handleKey({ v, t: 'kd', code: 'KeyA', mods: 0 })
    await injector.handleKey({ v, t: 'kd', code: 'KeyB', mods: 0 })

    await injector.releaseAll()
    await injector.releaseAll()

    expect(driver.buttonUp).toHaveBeenCalledWith('left')
    expect(driver.buttonUp).toHaveBeenCalledWith('right')
    expect(driver.keyUp).toHaveBeenCalledWith('KeyA')
    expect(driver.keyUp).toHaveBeenCalledWith('KeyB')
    expect(driver.buttonUp).toHaveBeenCalledTimes(3)
    expect(driver.keyUp).toHaveBeenCalledTimes(3)
    expect(driver.buttonUp.mock.calls.filter(([button]) => button === 'left')).toHaveLength(2)
    expect(driver.keyUp.mock.calls.filter(([code]) => code === 'KeyA')).toHaveLength(2)
  })

  it('serializes mouse down and up messages that arrive without awaiting each other', async () => {
    let finishButtonDown: (() => void) | undefined
    const buttonDownStarted = vi.fn()
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            buttonDownStarted()
            finishButtonDown = resolve
          }),
      ),
      buttonUp: vi.fn(),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
    }
    const injector = new InputInjector({ driver })

    const down = injector.handleMouse({ v, t: 'md', x: 0, y: 0, b: 0 }, { width: 100, height: 100 })
    const up = injector.handleMouse({ v, t: 'mu', x: 0, y: 0, b: 0 }, { width: 100, height: 100 })
    await expect.poll(() => buttonDownStarted).toHaveBeenCalledTimes(1)
    expect(driver.buttonUp).not.toHaveBeenCalled()

    finishButtonDown?.()
    await Promise.all([down, up])

    expect(driver.buttonDown).toHaveBeenCalledWith('left')
    expect(driver.buttonUp).toHaveBeenCalledWith('left')
  })

  it('handles release-all key messages without waiting on its own key queue', async () => {
    const driver = {
      move: vi.fn(),
      buttonDown: vi.fn(),
      buttonUp: vi.fn(),
      scroll: vi.fn(),
      keyDown: vi.fn(),
      keyUp: vi.fn(),
    }
    const injector = new InputInjector({ driver })

    await injector.handleKey({ v, t: 'kd', code: 'ShiftLeft', mods: 1 })
    await expect(injector.handleKey({ v, t: 'rk' })).resolves.toBeUndefined()

    expect(driver.keyUp).toHaveBeenCalledWith('ShiftLeft')
  })
})
