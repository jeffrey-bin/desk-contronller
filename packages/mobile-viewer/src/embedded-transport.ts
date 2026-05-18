import { PROTOCOL_VERSION } from '@desk/shared'

import {
  MobileWebSocketTransport,
  type MobileWebSocketConstructor,
  type MobileWebSocketLogger,
} from './relay-transport.js'

export type MobileEmbeddedTransportOptions = {
  url: string
  role: 'agent' | 'viewer'
  clientId: string
  webSocketCtor?: MobileWebSocketConstructor | undefined
  logger?: MobileWebSocketLogger | undefined
}

export class MobileEmbeddedTransport extends MobileWebSocketTransport {
  constructor(opts: MobileEmbeddedTransportOptions) {
    super({
      url: opts.url,
      handshake: {
        v: PROTOCOL_VERSION,
        t: 'hello',
        role: opts.role,
        clientId: opts.clientId,
      },
      webSocketCtor: opts.webSocketCtor,
      logger: opts.logger,
    })
  }
}
