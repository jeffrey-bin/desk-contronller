import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('viewer bootstrap', () => {
  it('keeps pair-result ok in connecting state until renderer reports PC connected', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/main/viewer/bootstrap.ts'),
      'utf8',
    )

    expect(source).toContain('viewerReportPeerConnectionState')
    expect(source).toContain("state === 'connected'")
    expect(source).not.toContain("setConnectionState(message.ok ? 'connected' : 'failed')")
  })

  it('turns a missing Agent socket into Viewer failed state instead of surfacing IPC errors', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/main/viewer/bootstrap.ts'),
      'utf8',
    )

    expect(source).toContain('Viewer transport failed to start')
    expect(source).toContain("await stopTransport('failed')")
    expect(source).toContain('return')
  })
})
