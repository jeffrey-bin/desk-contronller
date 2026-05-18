import { basename, extname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { preloadPathForMode } from '../src/main/windows.js'

describe('window preload paths', () => {
  it.each([
    ['agent', 'agent.cjs'],
    ['viewer', 'viewer.cjs'],
    ['welcome', 'welcome.cjs'],
  ] as const)('uses electron-vite preload output for %s', (mode, expectedFile) => {
    const preloadPath = preloadPathForMode(mode)

    expect(basename(preloadPath)).toBe(expectedFile)
    expect(extname(preloadPath)).toBe('.cjs')
  })
})
