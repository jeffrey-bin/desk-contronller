import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const dirname = fileURLToPath(new URL('.', import.meta.url))
const workspacePackages = ['@desk/shared', '@desk/signaling']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve(dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          agent: resolve(dirname, 'src/preload/agent.ts'),
          viewer: resolve(dirname, 'src/preload/viewer.ts'),
          welcome: resolve(dirname, 'src/preload/welcome.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          chunkFileNames: '[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          agent: resolve(dirname, 'src/renderer/agent.html'),
          agentHud: resolve(dirname, 'src/renderer/agent/hud.html'),
          viewer: resolve(dirname, 'src/renderer/viewer.html'),
          welcome: resolve(dirname, 'src/renderer/welcome.html'),
        },
      },
    },
  },
})
