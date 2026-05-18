import { describe, expect, it } from 'vitest'
import type { UserConfig } from 'vite'

import config from '../electron.vite.config.js'

type DesktopElectronViteConfig = {
  main?: {
    plugins?: unknown
  }
  preload?: {
    build?: {
      rollupOptions?: {
        output?: {
          format?: string
          entryFileNames?: string
          chunkFileNames?: string
        }
      }
    }
  }
}

type PluginWithConfig = {
  name: string
  config?: (config: UserConfig) => UserConfig | void
}

describe('electron-vite config', () => {
  it('bundles workspace packages into the Electron main process', () => {
    const electronConfig = config as DesktopElectronViteConfig
    const plugins = electronConfig.main?.plugins

    if (!Array.isArray(plugins)) {
      throw new Error('Expected main plugins')
    }

    const externalizeDepsPlugin = plugins.find(
      (plugin): plugin is PluginWithConfig =>
        typeof plugin === 'object' &&
        plugin !== null &&
        'name' in plugin &&
        plugin.name === 'vite:externalize-deps',
    )

    if (!externalizeDepsPlugin?.config) {
      throw new Error('Expected externalizeDepsPlugin')
    }

    const targetConfig: UserConfig = {}
    externalizeDepsPlugin.config(targetConfig)

    const external = targetConfig.build?.rollupOptions?.external

    expect(Array.isArray(external)).toBe(true)
    expect(String(external)).not.toContain('@desk/shared')
    expect(String(external)).not.toContain('@desk/signaling')
  })

  it('emits CommonJS preload files for Electron sandbox loading', () => {
    const electronConfig = config as DesktopElectronViteConfig
    const output = electronConfig.preload?.build?.rollupOptions?.output

    expect(output).toMatchObject({
      format: 'cjs',
      entryFileNames: '[name].cjs',
      chunkFileNames: '[name]-[hash].cjs',
    })
  })
})
