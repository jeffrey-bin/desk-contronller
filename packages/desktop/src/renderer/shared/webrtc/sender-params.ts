import { VIDEO_MAX_BITRATE_BPS, VIDEO_MAX_FRAMERATE } from '@desk/shared'

type TunableSendParameters = RTCRtpSendParameters & {
  degradationPreference?: 'maintain-resolution'
}

export async function tuneVideoSender(sender: RTCRtpSender): Promise<void> {
  if (typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
    return
  }

  const parameters = sender.getParameters() as TunableSendParameters
  parameters.encodings =
    parameters.encodings.length > 0
      ? parameters.encodings
      : ([{}] satisfies RTCRtpEncodingParameters[])

  for (const encoding of parameters.encodings) {
    encoding.maxBitrate = VIDEO_MAX_BITRATE_BPS
    encoding.maxFramerate = VIDEO_MAX_FRAMERATE
  }

  if ('degradationPreference' in parameters) {
    parameters.degradationPreference = 'maintain-resolution'
  }

  await sender.setParameters(parameters)
}
