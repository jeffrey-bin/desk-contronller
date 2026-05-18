import { useEffect, useRef } from 'react'

import { createInputSender } from '../input-sender.js'
import type { ViewerPeerController } from '../pc-controller.js'
import type { ViewerStats } from '../../shared/webrtc/stats.js'
import { StatsBar } from './StatsBar.js'

export function StreamView({
  stream,
  controller,
  stats,
}: {
  stream: MediaStream | undefined
  controller: ViewerPeerController | undefined
  stats: ViewerStats
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (video === null) {
      return
    }
    video.srcObject = stream ?? null
  }, [stream])

  useEffect(() => {
    const video = videoRef.current
    if (video === null || controller === undefined) {
      return
    }
    return createInputSender(controller.inputChannels()).attach(video)
  }, [controller])

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md bg-slate-950">
      <video
        ref={videoRef}
        autoPlay
        className="min-h-0 flex-1 bg-black object-contain outline-none"
        playsInline
        tabIndex={0}
      />
      <StatsBar stats={stats} />
    </section>
  )
}
