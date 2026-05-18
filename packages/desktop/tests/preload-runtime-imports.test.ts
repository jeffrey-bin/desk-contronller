import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const dirname = fileURLToPath(new URL('.', import.meta.url))
const preloadRoot = resolve(dirname, '../src/preload')

describe('preload runtime imports', () => {
  it.each(['agent.ts', 'viewer.ts', 'welcome.ts'])(
    'keeps %s self-contained for Electron sandbox preload',
    (file) => {
      const source = readFileSync(resolve(preloadRoot, file), 'utf8')
      const runtimeRelativeImports = source
        .split(/\r?\n/)
        .filter((line) => /^import\s+(?!type\b).*from\s+['"]\.\.?\/.+['"]/.test(line.trim()))

      expect(runtimeRelativeImports).toEqual([])
    },
  )
})
