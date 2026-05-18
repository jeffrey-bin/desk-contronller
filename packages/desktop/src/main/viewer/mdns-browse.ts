import { Bonjour } from 'bonjour-service'
import { MDNS_PROTOCOL, MDNS_SERVICE_TYPE } from '@desk/shared'

import type { DiscoveredAgent } from '../../shared/api-types.js'

type BonjourInstance = {
  find(options: { type: string; protocol: typeof MDNS_PROTOCOL }): BrowserInstance
  destroy(): void
}

type BrowserInstance = {
  start(): void
  stop(): void
  on(event: 'up' | 'down', listener: (service: ServiceLike) => void): unknown
  removeAllListeners(): unknown
}

type ServiceLike = {
  name: string
  port: number
  host: string
  fqdn?: string
  txt?: unknown
  addresses?: string[]
}

export type MdnsBrowseOptions = {
  bonjourFactory?: () => BonjourInstance
  onUp?: (agent: DiscoveredAgent) => void
  onDown?: (id: string) => void
  now?: () => number
}

export class MdnsBrowse {
  readonly #bonjourFactory: () => BonjourInstance
  readonly #onUp: (agent: DiscoveredAgent) => void
  readonly #onDown: (id: string) => void
  readonly #now: () => number
  readonly #agents = new Map<string, DiscoveredAgent>()
  #bonjour: BonjourInstance | undefined
  #browser: BrowserInstance | undefined

  constructor(options: MdnsBrowseOptions = {}) {
    this.#bonjourFactory = options.bonjourFactory ?? (() => new Bonjour())
    this.#onUp = options.onUp ?? (() => undefined)
    this.#onDown = options.onDown ?? (() => undefined)
    this.#now = options.now ?? Date.now
  }

  get agents(): DiscoveredAgent[] {
    return [...this.#agents.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  start(): void {
    if (this.#browser !== undefined) {
      return
    }

    const bonjour = this.#bonjourFactory()
    const browser = bonjour.find({ type: MDNS_SERVICE_TYPE, protocol: MDNS_PROTOCOL })
    browser.on('up', (service) => this.#upsert(service))
    browser.on('down', (service) => this.#remove(service))
    browser.start()

    this.#bonjour = bonjour
    this.#browser = browser
  }

  stop(): void {
    const browser = this.#browser
    const bonjour = this.#bonjour
    if (browser === undefined || bonjour === undefined) {
      return
    }

    this.#browser = undefined
    this.#bonjour = undefined
    this.#agents.clear()
    browser.stop()
    browser.removeAllListeners()
    bonjour.destroy()
  }

  #upsert(service: ServiceLike): void {
    const agent = serviceToAgent(service, this.#now())
    this.#agents.set(agent.id, agent)
    this.#onUp(agent)
  }

  #remove(service: ServiceLike): void {
    const id = serviceId(service)
    this.#agents.delete(id)
    this.#onDown(id)
  }
}

function serviceToAgent(service: ServiceLike, lastSeen: number): DiscoveredAgent {
  const host = service.addresses?.[0] ?? service.host

  return {
    id: serviceId(service),
    name: service.name,
    host,
    port: service.port,
    txt: normalizeTxt(service.txt),
    lastSeen,
  }
}

function serviceId(service: ServiceLike): string {
  return service.fqdn || `${service.name}.${service.host}:${service.port}`
}

function normalizeTxt(txt: unknown): Record<string, string> {
  if (txt === undefined || txt === null || typeof txt !== 'object' || Array.isArray(txt)) {
    return {}
  }

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(txt)) {
    if (typeof value === 'string') {
      normalized[key] = value
    }
  }
  return normalized
}
