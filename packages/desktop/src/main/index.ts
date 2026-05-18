import { app } from 'electron'
import log from 'electron-log/main'
import Store from 'electron-store'

import { bootstrapAgentMain } from './agent/bootstrap.js'
import { bootstrapViewerMain } from './viewer/bootstrap.js'
import { registerCleanup, runCleanups } from './ipc/registry.js'
import { registerWelcomeIpc } from './ipc/welcome.js'
import { resolveMode, resolveUserDataSuffix } from './mode.js'
import { configureRemoteDebugging } from './remote-debugging.js'
import { runShutdownWithTimeout } from './shutdown.js'
import type { AppMode } from './mode.js'
import { ensureSingleInstance } from './single-instance.js'
import { trackCurrentWindow } from './window-state.js'
import { closeAllWindows, makeWindow } from './windows.js'

type DesktopStore = {
  mode?: Exclude<AppMode, 'welcome'>
}

type MainWindow = Awaited<ReturnType<typeof makeWindow>>

configureRemoteDebugging(app.commandLine)

const packagedName = app.isPackaged ? `${app.getName()} ${process.execPath}` : undefined
const envMode = resolveMode({ packagedName, stored: undefined })
const userDataSuffix = resolveUserDataSuffix({ mode: envMode })

if (userDataSuffix !== undefined) {
  app.setPath('userData', `${app.getPath('userData')}-${userDataSuffix}`)
}

const store = new Store<DesktopStore>()
let currentMode: AppMode =
  envMode === 'welcome' ? resolveMode({ packagedName, stored: store.get('mode') }) : envMode
const mainWindowState: { current: MainWindow | undefined } = { current: undefined }
let isQuitting = false
let windowCleanup = Promise.resolve()

async function createMainWindow(mode: AppMode): Promise<void> {
  await windowCleanup
  currentMode = mode
  if (mode === 'welcome') {
    registerIpc()
  }
  const window = await makeWindow(mode)
  trackCurrentWindow(mainWindowState, window, () => {
    windowCleanup = shutdown()
  })

  if (mode === 'agent') {
    await bootstrapAgentMain({ window })
  }
  if (mode === 'viewer') {
    await bootstrapViewerMain({ window })
  }
}

async function switchMode(mode: Exclude<AppMode, 'welcome'>): Promise<void> {
  currentMode = mode
  await shutdown()
  closeAllWindows()
  await createMainWindow(mode)
}

function registerIpc(): void {
  if (currentMode === 'welcome') {
    registerWelcomeIpc({
      store,
      switchMode,
    })
  }
}

async function shutdown(): Promise<void> {
  await runShutdownWithTimeout({ runCleanups, logger: log })
}

if (ensureSingleInstance()) {
  app.on('second-instance', () => {
    if (mainWindowState.current === undefined) {
      return
    }

    if (mainWindowState.current.isMinimized()) {
      mainWindowState.current.restore()
    }

    mainWindowState.current.focus()
  })

  app.whenReady().then(
    async () => {
      registerCleanup(() => log.info('Main process cleanup complete'))
      await createMainWindow(currentMode)

      app.on('activate', () => {
        if (mainWindowState.current === undefined) {
          void createMainWindow(currentMode)
        }
      })
    },
    (error: unknown) => {
      log.error('App startup failed', error)
      app.quit()
    },
  )

  app.on('before-quit', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    isQuitting = true

    void shutdown().finally(() => app.quit())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
