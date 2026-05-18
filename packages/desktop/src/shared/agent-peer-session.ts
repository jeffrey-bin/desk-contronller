import type { AgentPeerConnectionState } from './api-types.js'

type PeerController = {
  stop(): void
}

export type AgentPeerSessionOptions<TStream, TController extends PeerController> = {
  capture(): Promise<TStream>
  createController(stream: TStream): Promise<TController>
  stopStream(stream: TStream): void
  reportPeerConnectionState(state: AgentPeerConnectionState): Promise<unknown> | unknown
}

export class AgentPeerSessionManager<TStream, TController extends PeerController> {
  readonly #capture: () => Promise<TStream>
  readonly #createController: (stream: TStream) => Promise<TController>
  readonly #stopStream: (stream: TStream) => void
  readonly #reportPeerConnectionState: (
    state: AgentPeerConnectionState,
  ) => Promise<unknown> | unknown
  #generation = 0
  #stream: TStream | undefined
  #controller: TController | undefined

  constructor(options: AgentPeerSessionOptions<TStream, TController>) {
    this.#capture = options.capture
    this.#createController = options.createController
    this.#stopStream = options.stopStream
    this.#reportPeerConnectionState = options.reportPeerConnectionState
  }

  async start(): Promise<void> {
    const generation = this.#nextGeneration()
    let capturedStream: TStream | undefined

    try {
      capturedStream = await this.#capture()
      if (generation !== this.#generation) {
        this.#stopStream(capturedStream)
        return
      }

      const controller = await this.#createController(capturedStream)
      if (generation !== this.#generation) {
        controller.stop()
        this.#stopStream(capturedStream)
        return
      }

      this.#stream = capturedStream
      this.#controller = controller
    } catch {
      if (capturedStream !== undefined) {
        this.#stopStream(capturedStream)
      }
      if (generation === this.#generation) {
        await this.#reportPeerConnectionState('failed')
      }
    }
  }

  stop(): void {
    this.#generation += 1
    this.#stopCurrent()
  }

  #nextGeneration(): number {
    this.#generation += 1
    this.#stopCurrent()
    return this.#generation
  }

  #stopCurrent(): void {
    this.#controller?.stop()
    this.#controller = undefined

    if (this.#stream !== undefined) {
      this.#stopStream(this.#stream)
      this.#stream = undefined
    }
  }
}
