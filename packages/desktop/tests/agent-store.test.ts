import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Agent renderer session-state handling', () => {
  it('drives connecting from session-state instead of viewer-connected', () => {
    const storeSource = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/agent/store.ts'),
      'utf8',
    )
    const appSource = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/agent/App.tsx'),
      'utf8',
    )

    expect(storeSource).toContain("case 'session-state'")
    expect(storeSource).toContain('connectionState: event.state.phase')
    expect(appSource).toContain(
      "event.type === 'session-state' && event.state.phase === 'connecting'",
    )
  })
})
