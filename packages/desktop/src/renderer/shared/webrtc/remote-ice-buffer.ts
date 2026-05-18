type PeerConnectionWithRemoteIce = {
  readonly remoteDescription: unknown | null
  addIceCandidate(candidate: unknown): Promise<void>
}

export type RemoteIceBuffer<TCandidate> = {
  add(candidate: TCandidate): Promise<void>
  flush(): Promise<void>
}

export function createRemoteIceBuffer<TCandidate>(
  pc: PeerConnectionWithRemoteIce,
): RemoteIceBuffer<TCandidate> {
  const pending: TCandidate[] = []

  const addNow = async (candidate: TCandidate): Promise<void> => {
    try {
      await pc.addIceCandidate(candidate)
    } catch {
      return undefined
    }
  }

  return {
    async add(candidate) {
      if (pc.remoteDescription === null) {
        pending.push(candidate)
        return
      }

      await addNow(candidate)
    },
    async flush() {
      if (pc.remoteDescription === null) {
        return
      }

      const candidates = pending.splice(0)
      for (const candidate of candidates) {
        await addNow(candidate)
      }
    },
  }
}
