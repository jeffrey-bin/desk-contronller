import { describe, expect, it } from 'vitest'

type SdpMungeModule = {
  preferH264(sdp: string): string
}

const sdpMungePath = '../src/renderer/shared/webrtc/sdp-munge.js'

describe('preferH264', () => {
  it('moves H264 payloads to the front of the video m-line', async () => {
    const { preferH264 } = (await import(sdpMungePath)) as SdpMungeModule
    const sdp = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=rtpmap:111 opus/48000/2',
      'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99',
      'a=rtpmap:96 VP8/90000',
      'a=rtpmap:97 H264/90000',
      'a=rtpmap:98 VP9/90000',
      'a=rtpmap:99 H264/90000',
      '',
    ].join('\r\n')

    expect(preferH264(sdp)).toContain('m=video 9 UDP/TLS/RTP/SAVPF 97 99 96 98')
  })

  it('keeps RTX apt payloads next to preferred H264 payloads', async () => {
    const { preferH264 } = (await import(sdpMungePath)) as SdpMungeModule
    const sdp = [
      'v=0',
      'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102',
      'a=rtpmap:96 VP8/90000',
      'a=rtpmap:97 rtx/90000',
      'a=fmtp:97 apt=96',
      'a=rtpmap:98 H264/90000',
      'a=rtpmap:99 rtx/90000',
      'a=fmtp:99 apt=98',
      'a=rtpmap:100 VP9/90000',
      'a=rtpmap:101 H264/90000',
      'a=rtpmap:102 rtx/90000',
      'a=fmtp:102 apt=101',
      '',
    ].join('\r\n')

    expect(preferH264(sdp)).toContain('m=video 9 UDP/TLS/RTP/SAVPF 98 99 101 102 96 97 100')
  })

  it('leaves SDP unchanged when H264 is missing', async () => {
    const { preferH264 } = (await import(sdpMungePath)) as SdpMungeModule
    const sdp = [
      'v=0',
      'm=video 9 UDP/TLS/RTP/SAVPF 96 98',
      'a=rtpmap:96 VP8/90000',
      'a=rtpmap:98 VP9/90000',
      '',
    ].join('\n')

    expect(preferH264(sdp)).toBe(sdp)
  })
})
