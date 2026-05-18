import { describe, expect, it, vi } from 'vitest'

import { MdnsBroadcast } from '../src/main/agent/mdns-broadcast.js'

describe('MdnsBroadcast', () => {
  it('publishes once and stops idempotently', async () => {
    const stop = vi.fn()
    const publish = vi.fn(() => ({ stop }))
    const destroy = vi.fn()
    const broadcast = new MdnsBroadcast({
      bonjourFactory: () => ({ publish, destroy }),
    })

    await broadcast.start({ port: 1234 })
    await broadcast.start({ port: 1234 })
    await broadcast.stop()
    await broadcast.stop()

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith({
      name: expect.stringMatching(/^desk-controller-agent/),
      type: 'remote-desktop',
      protocol: 'tcp',
      port: 1234,
      txt: { v: '1' },
    })
    expect(stop).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
