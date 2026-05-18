export function preferH264(sdp: string): string {
  const lines = sdp.split(/\r?\n/)
  const h264Payloads = new Set<string>()
  const rtxAptPayloads = new Map<string, string>()

  for (const line of lines) {
    const match = /^a=rtpmap:(\d+)\s+H264\//i.exec(line)
    if (match?.[1] !== undefined) {
      h264Payloads.add(match[1])
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

  if (h264Payloads.size === 0) {
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
    if (!h264Payloads.has(payload)) {
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
