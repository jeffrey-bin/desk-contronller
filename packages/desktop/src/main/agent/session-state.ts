import {
  ErrorCode,
  PairStore,
  PROTOCOL_VERSION,
  type PairVerifyResult,
  type SignalingMessage,
} from '@desk/shared'

export type AgentSessionState =
  | { phase: 'pairing'; code: string; expiresAt: number; attempts: number }
  | { phase: 'connecting'; viewerId: string }
  | { phase: 'active'; viewerId: string; since: number }
  | { phase: 'disconnecting'; reason: string }

type StateChangeHandler = (state: AgentSessionState) => void
type NowFn = () => number

export type AgentSessionOptions = {
  pairStore?: PairStore
  now?: NowFn
}

export class AgentSessionStateMachine {
  readonly #handlers = new Set<StateChangeHandler>()
  #pairStore: PairStore
  readonly #now: NowFn
  #state: AgentSessionState

  constructor(options: AgentSessionOptions = {}) {
    this.#now = options.now ?? Date.now
    this.#pairStore = options.pairStore ?? new PairStore(this.#now)
    this.#state = this.#pairingState()
  }

  get state(): AgentSessionState {
    return this.#state
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.#handlers.add(handler)

    return () => {
      this.#handlers.delete(handler)
    }
  }

  handlePairRequest(
    viewerId: string,
    code: string,
  ): Extract<SignalingMessage, { t: 'pair-result' }> {
    if (this.#state.phase !== 'pairing') {
      return { v: PROTOCOL_VERSION, t: 'pair-result', ok: false, reason: ErrorCode.E_PEER_BUSY }
    }

    const result = this.#pairStore.verify(code, viewerId)
    if (!result.ok) {
      this.#setState(this.#pairingState())
      return this.#pairResultFromVerify(result)
    }

    this.#setState({ phase: 'connecting', viewerId })
    return { v: PROTOCOL_VERSION, t: 'pair-result', ok: true }
  }

  peerConnected(): void {
    if (this.#state.phase !== 'connecting') {
      return
    }

    this.#setState({ phase: 'active', viewerId: this.#state.viewerId, since: this.#now() })
  }

  fail(reason: string): void {
    if (this.#state.phase === 'connecting') {
      this.refreshPairCode()
      return
    }

    this.disconnect(reason)
  }

  disconnect(reason: string): void {
    if (this.#state.phase === 'active' || this.#state.phase === 'connecting') {
      this.#setState({ phase: 'disconnecting', reason })
    }
  }

  cleanupComplete(): void {
    if (this.#state.phase === 'disconnecting') {
      this.refreshPairCode()
    }
  }

  refreshPairCode(): void {
    this.#pairStore = new PairStore(this.#now)
    this.#setState(this.#pairingState())
  }

  #pairingState(): AgentSessionState {
    this.#pairStore.refreshIfExpired()
    const snapshot = this.#pairStore.snapshot()

    return {
      phase: 'pairing',
      code: snapshot.code,
      expiresAt: snapshot.expiresAt,
      attempts: snapshot.attempts,
    }
  }

  #pairResultFromVerify(
    result: Extract<PairVerifyResult, { ok: false }>,
  ): Extract<SignalingMessage, { t: 'pair-result' }> {
    return { v: PROTOCOL_VERSION, t: 'pair-result', ok: false, reason: result.reason }
  }

  #setState(state: AgentSessionState): void {
    this.#state = state

    for (const handler of this.#handlers) {
      handler(state)
    }
  }
}
