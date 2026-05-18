import { BrowserWindow, screen } from 'electron'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AppMode } from './mode.js'
import { isAllowedNavigationUrl } from './navigation-policy.js'

const dirname = fileURLToPath(new URL('.', import.meta.url))
const rendererRoot = resolve(dirname, '../renderer')

type WindowProfile = {
  title: string
  width: number
  height: number
  minWidth: number
  minHeight: number
}

const profiles = {
  agent: {
    title: 'Desk Controller Agent',
    width: 720,
    height: 560,
    minWidth: 640,
    minHeight: 480,
  },
  viewer: {
    title: 'Desk Controller Viewer',
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
  },
  welcome: {
    title: 'Desk Controller',
    width: 760,
    height: 560,
    minWidth: 640,
    minHeight: 480,
  },
} satisfies Record<AppMode, WindowProfile>

function pageForMode(mode: AppMode): string {
  return `${mode}.html`
}

export function preloadPathForMode(mode: AppMode): string {
  return resolve(dirname, `../preload/${mode}.cjs`)
}

function rendererUrlForPage(page: string): string | undefined {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL

  if (rendererUrl === undefined) {
    return undefined
  }

  return `${rendererUrl.replace(/\/$/, '')}/${page}`
}

export async function loadWindowForMode(window: BrowserWindow, mode: AppMode): Promise<void> {
  await loadWindowPage(window, pageForMode(mode))
}

function secureNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigationUrl(url, process.env.ELECTRON_RENDERER_URL, rendererRoot)) {
      event.preventDefault()
    }
  })
}

async function loadWindowPage(window: BrowserWindow, page: string): Promise<void> {
  const rendererUrl = rendererUrlForPage(page)

  if (rendererUrl !== undefined) {
    await window.loadURL(rendererUrl)
    return
  }

  await window.loadFile(resolve(rendererRoot, page))
}

export async function makeWindow(mode: AppMode): Promise<BrowserWindow> {
  const profile = profiles[mode]
  const window = new BrowserWindow({
    title: profile.title,
    width: profile.width,
    height: profile.height,
    minWidth: profile.minWidth,
    minHeight: profile.minHeight,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPathForMode(mode),
    },
  })

  secureNavigation(window)
  await loadWindowForMode(window, mode)

  return window
}

export async function makeHudWindow(): Promise<BrowserWindow> {
  const display = screen.getPrimaryDisplay()
  const width = 180
  const height = 64
  const margin = 16
  const window = new BrowserWindow({
    title: 'Desk Controller Sharing',
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - margin,
    y: display.workArea.y + margin,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPathForMode('agent'),
    },
  })

  secureNavigation(window)
  window.setAlwaysOnTop(true, 'screen-saver')
  await loadWindowPage(window, 'agent/hud.html')

  return window
}

export function closeAllWindows(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.close()
  }
}
