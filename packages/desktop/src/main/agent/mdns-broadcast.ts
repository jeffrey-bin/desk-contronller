import { Bonjour, type Service } from 'bonjour-service'
import { MDNS_PROTOCOL, MDNS_SERVICE_TYPE, PROTOCOL_VERSION } from '@desk/shared'
import { hostname } from 'node:os'

type BonjourInstance = {
  publish(options: {
    name: string
    type: string
    protocol: typeof MDNS_PROTOCOL
    port: number
    txt: { v: string }
  }): Pick<Service, 'stop'>
  destroy(): void
}

export type MdnsBroadcastOptions = {
  name?: string
  bonjourFactory?: () => BonjourInstance
}

export class MdnsBroadcast {
  readonly #name: string
  readonly #bonjourFactory: () => BonjourInstance
  #bonjour: BonjourInstance | undefined
  #service: Pick<Service, 'stop'> | undefined

  constructor(options: MdnsBroadcastOptions = {}) {
    this.#name = options.name ?? `desk-controller-agent-${hostname()}`
    this.#bonjourFactory = options.bonjourFactory ?? (() => new Bonjour())
  }

  async start(options: { port: number }): Promise<void> {
    if (this.#service !== undefined) {
      return
    }

    const bonjour = this.#bonjourFactory()
    this.#bonjour = bonjour
    this.#service = bonjour.publish({
      name: this.#name,
      type: MDNS_SERVICE_TYPE,
      protocol: MDNS_PROTOCOL,
      port: options.port,
      txt: { v: String(PROTOCOL_VERSION) },
    })
  }

  async stop(): Promise<void> {
    const service = this.#service
    const bonjour = this.#bonjour
    if (service === undefined || bonjour === undefined) {
      return
    }

    this.#service = undefined
    this.#bonjour = undefined
    service.stop?.()
    bonjour.destroy()
  }
}
