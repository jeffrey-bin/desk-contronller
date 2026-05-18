import {
  DC_KEYBOARD_LABEL,
  DC_MOUSE_LABEL,
  PROTOCOL_VERSION,
  parseKeyMsg,
  parseMouseMsg,
  type SignalingMessage,
} from '@desk/shared'

import type { AgentApi, AgentEvent } from '../../shared/api-types.js'
import { createRemoteIceBuffer, type RemoteIceBuffer } from '../shared/webrtc/remote-ice-buffer.js'
import { preferH264 } from '../shared/webrtc/sdp-munge.js'
import { tuneVideoSender } from '../shared/webrtc/sender-params.js'

export type AgentPeerController = {
  stop(): void
}

type WireIceCandidate = Extract<SignalingMessage, { t: 'ice' }>['candidate']

export async function createAgentPeerController(
  api: AgentApi,
  stream: MediaStream,
): Promise<AgentPeerController> {
  const pc = new RTCPeerConnection()
  const remoteIce = createRemoteIceBuffer(pc)
  const unsubscribe = api.onEvent((event) => {
    void handleAgentEvent(pc, event, remoteIce)
  })

  for (const track of stream.getVideoTracks()) {
    const sender = pc.addTrack(track, stream)
    void tuneVideoSender(sender)
  }

  const mouseChannel = pc.createDataChannel(DC_MOUSE_LABEL, {
    ordered: false,
    maxRetransmits: 0,
  })
  const keyboardChannel = pc.createDataChannel(DC_KEYBOARD_LABEL, { ordered: true })

  mouseChannel.onmessage = (event) => {
    const result = parseMouseMsg(parseDataChannelMessage(event.data))
    if (result.ok) {
      void api.sendMouse(result.value)
    } else {
      console.warn('Dropped invalid mouse control message', result.error.message)
    }
  }
  keyboardChannel.onmessage = (event) => {
    const result = parseKeyMsg(parseDataChannelMessage(event.data))
    if (result.ok) {
      void api.sendKey(result.value)
    } else {
      console.warn('Dropped invalid keyboard control message', result.error.message)
    }
  }
  pc.onicecandidate = (event) => {
    if (event.candidate !== null) {
      void api.sendSignal({
        v: PROTOCOL_VERSION,
        t: 'ice',
        candidate: toWireIceCandidate(event.candidate.toJSON()),
      })
    }
  }
  pc.onconnectionstatechange = () => {
    if (isReportablePeerState(pc.connectionState)) {
      void api.reportPeerConnectionState(pc.connectionState)
    }
  }
  pc.oniceconnectionstatechange = () => {
    if (isReportableIceState(pc.iceConnectionState)) {
      void api.reportPeerConnectionState(pc.iceConnectionState)
    }
  }

  const offer = await pc.createOffer()
  const mungedOffer = new RTCSessionDescription({
    type: offer.type,
    sdp: preferH264(offer.sdp ?? ''),
  })
  await pc.setLocalDescription(mungedOffer)
  await api.sendSignal({ v: PROTOCOL_VERSION, t: 'offer', sdp: mungedOffer.sdp })

  return {
    stop() {
      unsubscribe()
      mouseChannel.close()
      keyboardChannel.close()
      pc.close()
    },
  }
}

async function handleAgentEvent(
  pc: RTCPeerConnection,
  event: AgentEvent,
  remoteIce: RemoteIceBuffer<RTCIceCandidateInit>,
): Promise<void> {
  if (event.type !== 'signaling-message') {
    return
  }

  await applySignalingMessage(pc, event.message, remoteIce)
}

async function applySignalingMessage(
  pc: RTCPeerConnection,
  message: SignalingMessage,
  remoteIce: RemoteIceBuffer<RTCIceCandidateInit>,
): Promise<void> {
  switch (message.t) {
    case 'answer':
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      await remoteIce.flush()
      break
    case 'ice':
      await remoteIce.add(toRtcIceCandidate(message.candidate))
      break
    default:
      break
  }
}

function toWireIceCandidate(candidate: RTCIceCandidateInit): WireIceCandidate {
  return {
    candidate: candidate.candidate ?? '',
    ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
    ...(candidate.sdpMLineIndex !== undefined ? { sdpMLineIndex: candidate.sdpMLineIndex } : {}),
    ...(candidate.usernameFragment !== undefined
      ? { usernameFragment: candidate.usernameFragment }
      : {}),
  }
}

function toRtcIceCandidate(candidate: WireIceCandidate): RTCIceCandidateInit {
  return {
    candidate: candidate.candidate,
    ...(candidate.sdpMid !== undefined ? { sdpMid: candidate.sdpMid } : {}),
    ...(candidate.sdpMLineIndex !== undefined ? { sdpMLineIndex: candidate.sdpMLineIndex } : {}),
    ...(candidate.usernameFragment !== undefined
      ? { usernameFragment: candidate.usernameFragment }
      : {}),
  }
}

function parseDataChannelMessage(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data
  }

  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}

function isReportablePeerState(
  state: RTCPeerConnectionState,
): state is 'connected' | 'disconnected' | 'failed' | 'closed' {
  return (
    state === 'connected' || state === 'disconnected' || state === 'failed' || state === 'closed'
  )
}

function isReportableIceState(
  state: RTCIceConnectionState,
): state is 'connected' | 'disconnected' | 'failed' | 'closed' {
  return (
    state === 'connected' || state === 'disconnected' || state === 'failed' || state === 'closed'
  )
}
