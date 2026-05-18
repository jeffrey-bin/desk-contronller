export type VideoCodecPreference = 'H264' | 'VP8' | 'VP9'

export function preferH264(sdp: string): string {
  return preferVideoCodec(sdp, 'H264')
}

export function preferVideoCodec(sdp: string, codec: VideoCodecPreference): string {
  const lines = sdp.split(/\r?\n/)
  const preferredPayloads = new Set<string>()
  const rtxAptPayloads = new Map<string, string>()
  const codecPattern = new RegExp(`^a=rtpmap:(\\d+)\\s+${codec}/`, 'i')

  for (const line of lines) {
    const match = codecPattern.exec(line)
    if (match?.[1] !== undefined) {
      preferredPayloads.add(match[1])
    }

    const fmtpMatch = /^a=fmtp:(\d+)\s+(.+)$/i.exec(line)
    const aptMatch =
      fmtpMatch?.[2] === undefined
        ? undefined
        : /(?:^|[;\s])apt=(\d+)(?:[;\s]|$)/i.exec(fmtpMatch[2])
    if (fmtpMatch?.[1] !== undefined && aptMatch?.[1] !== undefined) {
      rtxAptPayloads.set(aptMatch[1], fmtpMatch[1])
    }
  }

  if (preferredPayloads.size === 0) {
    return sdp
  }

  const videoLineIndex = lines.findIndex((line) => line.startsWith('m=video '))
  if (videoLineIndex === -1) {
    return sdp
  }

  const videoLine = lines[videoLineIndex]
  if (videoLine === undefined) {
    return sdp
  }

  const parts = videoLine.split(' ')
  const header = parts.slice(0, 3)
  const payloads = parts.slice(3)
  const preferred: string[] = []
  const preferredSet = new Set<string>()
  for (const payload of payloads) {
    if (!preferredPayloads.has(payload)) {
      continue
    }

    preferred.push(payload)
    preferredSet.add(payload)
    const rtxPayload = rtxAptPayloads.get(payload)
    if (rtxPayload !== undefined && payloads.includes(rtxPayload)) {
      preferred.push(rtxPayload)
      preferredSet.add(rtxPayload)
    }
  }

  if (preferred.length === 0) {
    return sdp
  }

  const rest = payloads.filter((payload) => !preferredSet.has(payload))
  lines[videoLineIndex] = [...header, ...preferred, ...rest].join(' ')

  return lines.join(sdp.includes('\r\n') ? '\r\n' : '\n')
}
