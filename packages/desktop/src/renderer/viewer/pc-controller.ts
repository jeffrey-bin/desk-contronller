import { PROTOCOL_VERSION, type SignalingMessage } from '@desk/shared'

import type { ViewerApi, ViewerEvent } from '../../shared/api-types.js'
import { createRemoteIceBuffer, type RemoteIceBuffer } from '../shared/webrtc/remote-ice-buffer.js'
import { startViewerStatsPoller, type ViewerStats } from '../shared/webrtc/stats.js'

export type ViewerPeerController = {
  stop(): void
  inputChannels(): { mouse?: RTCDataChannel; keyboard?: RTCDataChannel }
}

type WireIceCandidate = Extract<SignalingMessage, { t: 'ice' }>['candidate']

export async function createViewerPeerController(options: {
  api: ViewerApi
  onStream(stream: MediaStream): void
  onStats(stats: ViewerStats): void
}): Promise<ViewerPeerController> {
  const pc = new RTCPeerConnection()
  const channels: { mouse?: RTCDataChannel; keyboard?: RTCDataChannel } = {}
  const remoteIce = createRemoteIceBuffer(pc)
  let stopped = false
  let stopStats = (): void => undefined
  const unsubscribe = options.api.onEvent((event) => {
    void handleViewerEvent(pc, event, options.api, stopInternal, remoteIce)
  })
  stopStats = startViewerStatsPoller({
    pc,
    onStats: options.onStats,
  })

  const stopInternal = (sendBye: boolean): void => {
    if (stopped) {
      return
    }
    stopped = true
    stopStats()
    unsubscribe()
    sendReleaseAll(channels.keyboard)
    if (sendBye) {
      void options.api.sendSignal({ v: PROTOCOL_VERSION, t: 'bye', reason: 'viewer-peer-closed' })
    }
    channels.mouse?.close()
    channels.keyboard?.close()
    pc.close()
  }

  pc.ontrack = (event) => {
    const [stream] = event.streams
    if (stream !== undefined) {
      options.onStream(stream)
    }
  }
  pc.ondatachannel = (event) => {
    if (event.channel.label === 'mouse') {
      channels.mouse = event.channel
    }
    if (event.channel.label === 'keyboard') {
      channels.keyboard = event.channel
    }
  }
  pc.onicecandidate = (event) => {
    if (event.candidate !== null) {
      void options.api.sendSignal({
        v: PROTOCOL_VERSION,
        t: 'ice',
        candidate: toWireIceCandidate(event.candidate.toJSON()),
      })
    }
  }
  pc.onconnectionstatechange = () => {
    if (!stopped && isReportablePeerState(pc.connectionState)) {
      handlePeerState(pc.connectionState, options.api, stopInternal)
    }
  }
  pc.oniceconnectionstatechange = () => {
    if (!stopped && isReportableIceState(pc.iceConnectionState)) {
      handlePeerState(pc.iceConnectionState, options.api, stopInternal)
    }
  }

  return {
    stop() {
      stopInternal(true)
    },
    inputChannels() {
      return channels
    },
  }
}

function handlePeerState(
  state: 'connected' | 'disconnected' | 'failed' | 'closed',
  api: ViewerApi,
  stopInternal: (sendBye: boolean) => void,
): void {
  void api.reportPeerConnectionState(state)
  if (state === 'disconnected' || state === 'failed' || state === 'closed') {
    void api.sendSignal({ v: PROTOCOL_VERSION, t: 'bye', reason: `viewer-peer-${state}` })
    stopInternal(false)
  }
}

function isReportablePeerState(
  state: RTCPeerConnectionState,
): state is 'connected' | 'disconnected' | 'failed' | 'closed' {
  return (
    state === 'connected' || state === 'disconnected' || state === 'failed' || state === 'closed'
  )
}

async function handleViewerEvent(
  pc: RTCPeerConnection,
  event: ViewerEvent,
  api: ViewerApi,
  stopInternal: (sendBye: boolean) => void,
  remoteIce: RemoteIceBuffer<RTCIceCandidateInit>,
): Promise<void> {
  if (event.type !== 'signaling-message') {
    return
  }

  switch (event.message.t) {
    case 'offer':
      await pc.setRemoteDescription({ type: 'offer', sdp: event.message.sdp })
      await remoteIce.flush()
      {
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await api.sendSignal({ v: PROTOCOL_VERSION, t: 'answer', sdp: answer.sdp ?? '' })
      }
      break
    case 'ice':
      await remoteIce.add(toRtcIceCandidate(event.message.candidate))
      break
    case 'bye':
      void api.reportPeerConnectionState('closed')
      stopInternal(false)
      break
    default:
      break
  }
}

function sendReleaseAll(channel: RTCDataChannel | undefined): void {
  if (channel?.readyState === 'open') {
    channel.send(JSON.stringify({ v: PROTOCOL_VERSION, t: 'rk' }))
  }
}

function isReportableIceState(
  state: RTCIceConnectionState,
): state is 'connected' | 'disconnected' | 'failed' | 'closed' {
  return (
    state === 'connected' || state === 'disconnected' || state === 'failed' || state === 'closed'
  )
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
