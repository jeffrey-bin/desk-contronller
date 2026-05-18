import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { MdnsBrowse } from '../src/main/viewer/mdns-browse.js'

describe('MdnsBrowse', () => {
  it('emits one discovery for one browser up event', () => {
    const up = vi.fn()
    const browser = new EventEmitter() as EventEmitter & {
      start(): void
      stop(): void
      services: unknown[]
    }
    browser.start = vi.fn()
    browser.stop = vi.fn()
    browser.services = []
    const browse = new MdnsBrowse({
      bonjourFactory: () => ({
        find: () => {
          return browser
        },
        destroy: vi.fn(),
      }),
      onUp: up,
      now: () => 123,
    })

    browse.start()
    browser.emit('up', service())

    expect(up).toHaveBeenCalledTimes(1)
  })
})

function service(): {
  name: string
  type: string
  port: number
  host: string
  fqdn: string
  txt: Record<string, string>
  addresses: string[]
} {
  return {
    name: 'Agent',
    type: 'remote-desktop',
    port: 4567,
    host: 'agent.local',
    fqdn: 'Agent._remote-desktop._tcp.local',
    txt: { v: '1' },
    addresses: ['192.168.1.2'],
  }
}
