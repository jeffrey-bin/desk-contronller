import { PROTOCOL_VERSION, type SignalingMessage } from '@desk/shared'
import type { SignalingTransport } from '@desk/signaling'

export type MobileViewerState = 'idle' | 'pairing' | 'negotiating' | 'streaming' | 'failed'

export type MobileRemoteStream = {
  id: string
  videoTracks: number
}

export type MobilePeerAdapter = {
  acceptOffer(sdp: string): Promise<{ answerSdp: string; stream: MobileRemoteStream }>
  addIceCandidate(candidate: Extract<SignalingMessage, { t: 'ice' }>['candidate']): Promise<void>
}

export type MobileViewerSnapshot = {
  state: MobileViewerState
  stream: MobileRemoteStream | undefined
}

export type MobileViewerUnsubscribe = () => void

export type MobileViewerSessionOptions = {
  transport: SignalingTransport
  peer: MobilePeerAdapter
}

export class MobileViewerSession {
  readonly #transport: SignalingTransport
  readonly #peer: MobilePeerAdapter
  readonly #changeHandlers = new Set<(snapshot: MobileViewerSnapshot) => void>()
  #state: MobileViewerState = 'idle'
  #stream: MobileRemoteStream | undefined

  constructor(opts: MobileViewerSessionOptions) {
    this.#transport = opts.transport
    this.#peer = opts.peer
    this.#transport.onMessage((message) => {
      void this.#handleMessage(message)
    })
  }

  get state(): MobileViewerState {
    return this.#state
  }

  get stream(): MobileRemoteStream | undefined {
    return this.#stream
  }

  onChange(handler: (snapshot: MobileViewerSnapshot) => void): MobileViewerUnsubscribe {
    this.#changeHandlers.add(handler)

    return () => {
      this.#changeHandlers.delete(handler)
    }
  }

  async connect(pairCode: string): Promise<void> {
    this.#setState('pairing')
    await this.#transport.start()
    this.#transport.send({
      v: PROTOCOL_VERSION,
      t: 'pair-request',
      code: pairCode,
    })
  }

  async disconnect(reason = 'viewer-disconnect'): Promise<void> {
    this.#transport.send({
      v: PROTOCOL_VERSION,
      t: 'bye',
      reason,
    })
    await this.#transport.stop()
    this.#stream = undefined
    this.#setState('idle')
  }

  async #handleMessage(message: SignalingMessage): Promise<void> {
    if (message.t === 'pair-result') {
      this.#setState(message.ok ? 'negotiating' : 'failed')
      return
    }

    if (message.t === 'offer') {
      this.#setState('negotiating')
      const accepted = await this.#peer.acceptOffer(message.sdp)
      this.#stream = accepted.stream
      this.#transport.send({
        v: PROTOCOL_VERSION,
        t: 'answer',
        sdp: accepted.answerSdp,
      })
      this.#setState('streaming')
      return
    }

    if (message.t === 'ice') {
      await this.#peer.addIceCandidate(message.candidate)
      return
    }

    if (message.t === 'bye') {
      this.#stream = undefined
      this.#setState('idle')
    }
  }

  #setState(state: MobileViewerState): void {
    this.#state = state
    this.#emitChange()
  }

  #emitChange(): void {
    const snapshot: MobileViewerSnapshot = {
      state: this.#state,
      stream: this.#stream,
    }

    for (const handler of this.#changeHandlers) {
      handler(snapshot)
    }
  }
}
