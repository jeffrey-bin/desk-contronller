export type ViewerStats = {
  fps?: number
  bitrateBps?: number
  rttMs?: number
  packetLoss?: number
}

export type ViewerStatsSample = {
  timestamp: number
  bytesReceived: number
}

export type ExtractedViewerStats = ViewerStats & {
  sample?: ViewerStatsSample
}

type StatsEntry = Record<string, unknown>
type StatsReport = Iterable<StatsEntry | [unknown, StatsEntry]>

export function extractViewerStats(
  report: StatsReport,
  previous?: ViewerStatsSample,
): ExtractedViewerStats {
  const inbound = findInboundVideo(report)
  const pair = findActiveCandidatePair(report)
  const sample = sampleFromInbound(inbound)
  const stats: ExtractedViewerStats = {}
  const fps = finiteNumber(inbound?.framesPerSecond)
  const nextBitrate = bitrate(sample, previous)
  const rttMs = milliseconds(finiteNumber(pair?.currentRoundTripTime))
  const nextPacketLoss = packetLoss(inbound)

  if (fps !== undefined) stats.fps = fps
  if (nextBitrate !== undefined) stats.bitrateBps = nextBitrate
  if (rttMs !== undefined) stats.rttMs = rttMs
  if (nextPacketLoss !== undefined) stats.packetLoss = nextPacketLoss
  if (sample !== undefined) stats.sample = sample

  return stats
}

export function startViewerStatsPoller(options: {
  pc: { getStats(): Promise<StatsReport> }
  intervalMs?: number
  onStats(stats: ViewerStats): void
}): () => void {
  let previous: ViewerStatsSample | undefined
  let stopped = false

  const poll = (): void => {
    void options.pc
      .getStats()
      .then((report) => {
        if (stopped) {
          return
        }
        const extracted = extractViewerStats(report, previous)
        previous = extracted.sample
        options.onStats(toViewerStats(extracted))
      })
      .catch(() => undefined)
  }

  poll()
  const id = window.setInterval(poll, options.intervalMs ?? 1_000)
  return () => {
    stopped = true
    window.clearInterval(id)
  }
}

function findInboundVideo(report: StatsReport): StatsEntry | undefined {
  for (const entry of entries(report)) {
    if (entry.type === 'inbound-rtp' && (entry.kind === 'video' || entry.mediaType === 'video')) {
      return entry
    }
  }
  return undefined
}

function findActiveCandidatePair(report: StatsReport): StatsEntry | undefined {
  for (const entry of entries(report)) {
    if (
      entry.type === 'candidate-pair' &&
      (entry.state === 'succeeded' || entry.nominated === true)
    ) {
      return entry
    }
  }
  return undefined
}

function sampleFromInbound(inbound: StatsEntry | undefined): ViewerStatsSample | undefined {
  const timestamp = finiteNumber(inbound?.timestamp)
  const bytesReceived = finiteNumber(inbound?.bytesReceived)
  if (timestamp === undefined || bytesReceived === undefined) {
    return undefined
  }
  return { timestamp, bytesReceived }
}

function bitrate(
  sample: ViewerStatsSample | undefined,
  previous?: ViewerStatsSample,
): number | undefined {
  if (sample === undefined || previous === undefined || sample.timestamp <= previous.timestamp) {
    return undefined
  }
  return (
    ((sample.bytesReceived - previous.bytesReceived) * 8 * 1_000) /
    (sample.timestamp - previous.timestamp)
  )
}

function packetLoss(inbound: StatsEntry | undefined): number | undefined {
  const lost = finiteNumber(inbound?.packetsLost)
  const received = finiteNumber(inbound?.packetsReceived)
  if (lost === undefined || received === undefined || lost + received <= 0) {
    return undefined
  }
  return lost / (lost + received)
}

function milliseconds(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value * 1_000
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toViewerStats(extracted: ExtractedViewerStats): ViewerStats {
  const stats: ViewerStats = {}
  if (extracted.fps !== undefined) stats.fps = extracted.fps
  if (extracted.bitrateBps !== undefined) stats.bitrateBps = extracted.bitrateBps
  if (extracted.rttMs !== undefined) stats.rttMs = extracted.rttMs
  if (extracted.packetLoss !== undefined) stats.packetLoss = extracted.packetLoss
  return stats
}

function* entries(report: StatsReport): Iterable<StatsEntry> {
  for (const item of report) {
    if (Array.isArray(item)) {
      yield item[1]
    } else {
      yield item
    }
  }
}
