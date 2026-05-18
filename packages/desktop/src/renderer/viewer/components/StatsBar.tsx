import type { ViewerStats } from '../../shared/webrtc/stats.js'

export function StatsBar({ stats }: { stats: ViewerStats }): JSX.Element {
  return (
    <dl className="grid grid-cols-4 gap-2 border-t border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
      <Item label="FPS" value={formatNumber(stats.fps, 0)} />
      <Item label="Bitrate" value={formatBitrate(stats.bitrateBps)} />
      <Item label="RTT" value={stats.rttMs === undefined ? '-' : `${Math.round(stats.rttMs)} ms`} />
      <Item label="Loss" value={formatPercent(stats.packetLoss)} />
    </dl>
  )
}

function Item({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}

function formatNumber(value: number | undefined, digits: number): string {
  return value === undefined ? '-' : value.toFixed(digits)
}

function formatBitrate(value: number | undefined): string {
  if (value === undefined) {
    return '-'
  }
  return `${(value / 1_000_000).toFixed(1)} Mbps`
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? '-' : `${(value * 100).toFixed(1)}%`
}
