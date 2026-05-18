import { describe, expect, it } from 'vitest'

import { tuneVideoSender } from '../src/renderer/shared/webrtc/sender-params.js'

describe('tuneVideoSender', () => {
  it('can scale down Android RN video while preserving bitrate and frame rate caps', async () => {
    const parameters = { encodings: [{}] }
    const sender = {
      getParameters: () => parameters,
      setParameters: (nextParameters: typeof parameters) => {
        parameters.encodings = nextParameters.encodings
      },
    } as unknown as RTCRtpSender

    await tuneVideoSender(sender, { scaleResolutionDownBy: 2 })

    expect(parameters.encodings[0]).toMatchObject({
      maxBitrate: 8_000_000,
      maxFramerate: 60,
      scaleResolutionDownBy: 2,
    })
  })
})
