import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('viewer WebRTC stats', () => {
  it('extracts core viewer metrics without throwing from poller failures', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/shared/webrtc/stats.ts'),
      'utf8',
    )

    expect(source).toContain('export function extractViewerStats')
    expect(source).toContain('framesPerSecond')
    expect(source).toContain('bytesReceived')
    expect(source).toContain('currentRoundTripTime')
    expect(source).toContain('packetsLost')
    expect(source).toContain('.catch(() => undefined)')
  })
})
