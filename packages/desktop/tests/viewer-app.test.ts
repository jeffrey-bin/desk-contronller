import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('viewer App controller lifecycle', () => {
  it('resets controller before connect and after disconnect', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/viewer/App.tsx'),
      'utf8',
    )

    expect(source).toContain('resetController')
    expect(source).toContain('await resetController()')
    expect(source).toContain('void resetController()')
    expect(source).toContain('setController(undefined)')
    expect(source).toContain('setStream(undefined)')
  })
})
