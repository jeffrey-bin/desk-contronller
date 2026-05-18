import type { SignalingMessage } from '@desk/shared'
import {
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
} from 'react-native-webrtc'

import type { MobilePeerAdapter, MobileRemoteStream } from '../src/mobile-viewer-session'

type WireIceCandidate = Extract<SignalingMessage, { t: 'ice' }>['candidate']
type NativeIceCandidateInit = {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}
type PeerConnectionEvents = {
  addEventListener(
    type: 'icecandidate',
    listener: (event: { candidate: { toJSON(): NativeIceCandidateInit } | null }) => void,
  ): void
  addEventListener(type: 'track', listener: (event: { streams: MediaStream[] }) => void): void
  addEventListener(
    type: 'connectionstatechange' | 'iceconnectionstatechange' | 'signalingstatechange',
    listener: () => void,
  ): void
}
type PeerConnectionStateSnapshot = {
  connectionState?: string
  iceConnectionState?: string
  signalingState?: string
}

export function createNativePeerAdapter(): MobilePeerAdapter {
  let pc: RTCPeerConnection | undefined
  let remoteDescriptionReady = false
  let pendingRemoteCandidates: NativeIceCandidateInit[] = []

  return {
    async acceptOffer(
      sdp: string,
      onIceCandidate: (candidate: WireIceCandidate) => void,
    ): Promise<{ answerSdp: string; stream: MobileRemoteStream }> {
      if (!isSessionDescription(sdp)) {
        return {
          answerSdp: `rn-answer:${sdp}`,
          stream: {
            id: 'rn-remote-stream',
            videoTracks: 1,
          },
        }
      }

      pc?.close()
      pc = new RTCPeerConnection()
      remoteDescriptionReady = false
      pendingRemoteCandidates = []
      const remoteStream = waitForRemoteStream(pc)

      const events = pc as unknown as PeerConnectionEvents
      events.addEventListener('icecandidate', (event) => {
        if (event.candidate !== null) {
          onIceCandidate(toWireIceCandidate(event.candidate.toJSON()))
        }
      })
      events.addEventListener('connectionstatechange', () => logPeerState('connection', pc))
      events.addEventListener('iceconnectionstatechange', () => logPeerState('ice', pc))
      events.addEventListener('signalingstatechange', () => logPeerState('signaling', pc))

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }))
      remoteDescriptionReady = true
      await flushPendingRemoteCandidates(pc, pendingRemoteCandidates)
      pendingRemoteCandidates = []
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      const stream = await remoteStream

      return {
        answerSdp: answer.sdp ?? '',
        stream: {
          id: stream.id,
          streamURL: stream.toURL(),
          videoTracks: stream.getVideoTracks().length,
        },
      }
    },
    async addIceCandidate(candidate: WireIceCandidate): Promise<void> {
      const nextCandidate = toRtcIceCandidate(candidate)
      if (pc === undefined) {
        return
      }
      if (!remoteDescriptionReady) {
        pendingRemoteCandidates.push(nextCandidate)
        return
      }

      await pc.addIceCandidate(new RTCIceCandidate(nextCandidate))
    },
  }
}

function waitForRemoteStream(pc: RTCPeerConnection): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out waiting for remote media stream'))
    }, 10_000)

    const events = pc as unknown as PeerConnectionEvents
    events.addEventListener('track', (event) => {
      const stream = event.streams[0]
      if (stream === undefined) {
        return
      }

      clearTimeout(timeout)
      resolve(stream)
    })
  })
}

async function flushPendingRemoteCandidates(
  pc: RTCPeerConnection,
  candidates: NativeIceCandidateInit[],
): Promise<void> {
  for (const candidate of candidates) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate))
  }
}

function logPeerState(label: string, pc: RTCPeerConnection | undefined): void {
  const state = pc as unknown as PeerConnectionStateSnapshot | undefined
  console.info(
    `[desk-rn-webrtc] ${label} connection=${state?.connectionState ?? 'unknown'} ice=${
      state?.iceConnectionState ?? 'unknown'
    } signaling=${state?.signalingState ?? 'unknown'}`,
  )
}

function isSessionDescription(sdp: string): boolean {
  return sdp.trimStart().startsWith('v=0')
}

function toWireIceCandidate(candidate: NativeIceCandidateInit): WireIceCandidate {
  return {
    candidate: candidate.candidate ?? '',
    ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
    ...(candidate.sdpMLineIndex !== undefined ? { sdpMLineIndex: candidate.sdpMLineIndex } : {}),
    ...(candidate.usernameFragment !== undefined
      ? { usernameFragment: candidate.usernameFragment }
      : {}),
  }
}

function toRtcIceCandidate(candidate: WireIceCandidate): NativeIceCandidateInit {
  return {
    candidate: candidate.candidate,
    ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
    ...(candidate.sdpMLineIndex !== undefined ? { sdpMLineIndex: candidate.sdpMLineIndex } : {}),
  }
}
