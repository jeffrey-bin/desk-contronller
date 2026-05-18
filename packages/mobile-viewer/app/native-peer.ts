import type { MobilePeerAdapter, MobileRemoteStream } from '../src/mobile-viewer-session'

export function createNativePeerAdapter(): MobilePeerAdapter {
  return {
    async acceptOffer(sdp: string): Promise<{ answerSdp: string; stream: MobileRemoteStream }> {
      return {
        answerSdp: `rn-answer:${sdp}`,
        stream: {
          id: 'rn-remote-stream',
          videoTracks: 1,
        },
      }
    },
    async addIceCandidate(): Promise<void> {
      return undefined
    },
  }
}
