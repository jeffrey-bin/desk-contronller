import { expect, test, type Browser, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const repoRoot = resolve(import.meta.dirname, '../../..')
const desktopRoot = resolve(repoRoot, 'packages/desktop')
const artifactDir = resolve(repoRoot, 'logs/e2e/desktop-real')

type RunningApp = {
  name: string
  process: ChildProcess
  processGroupId: number
  cdpEndpoint: string
  logFile: string
}

test.describe.configure({ mode: 'serial' })

test('Agent and Viewer connect through real Electron renderers', async ({
  playwright,
}, testInfo) => {
  test.setTimeout(90_000)

  const agentPort = await getFreePort()
  const viewerPort = await getFreePort()
  const startedApps: RunningApp[] = []

  try {
    const agent = await startDesktopApp('agent', agentPort)
    const viewer = await startDesktopApp('viewer', viewerPort)
    startedApps.push(agent, viewer)
    await testInfo.attach('agent-log-path', { body: agent.logFile, contentType: 'text/plain' })
    await testInfo.attach('viewer-log-path', { body: viewer.logFile, contentType: 'text/plain' })

    const agentBrowser = await playwright.chromium.connectOverCDP(agent.cdpEndpoint)
    const viewerBrowser = await playwright.chromium.connectOverCDP(viewer.cdpEndpoint)

    try {
      const agentPage = await waitForElectronPage(agentBrowser)
      const viewerPage = await waitForElectronPage(viewerBrowser)

      await agentPage.bringToFront()
      await agentPage.waitForTimeout(1_000)

      const agentInfo = await readAgentInfo(agentPage)
      await viewerPage.getByLabel('Host').fill('127.0.0.1')
      await viewerPage.getByLabel('Port').fill(String(agentInfo.port))
      await viewerPage.getByLabel('Pair code').fill(agentInfo.code)
      await viewerPage.getByRole('button', { name: 'Connect', exact: true }).click()

      await expect(viewerPage.getByText('connected', { exact: true })).toBeVisible({
        timeout: 20_000,
      })
      await expect(agentPage.getByText('active', { exact: true })).toBeVisible({
        timeout: 20_000,
      })

      await viewerPage.bringToFront()
      await viewerPage.locator('video').evaluate((video) => {
        const element = video as HTMLVideoElement
        void element.play().catch(() => undefined)
      })

      await expect
        .poll(
          async () =>
            viewerPage.locator('video').evaluate((video) => {
              const element = video as HTMLVideoElement
              const stream = element.srcObject instanceof MediaStream ? element.srcObject : null
              const [track] = stream?.getVideoTracks() ?? []
              return {
                srcObject: element.srcObject !== null,
                trackReadyState: track?.readyState,
                videoTracks: stream?.getVideoTracks().length ?? 0,
              }
            }),
          { timeout: 20_000 },
        )
        .toMatchObject({
          srcObject: true,
          trackReadyState: 'live',
          videoTracks: 1,
        })
    } finally {
      await agentBrowser.close()
      await viewerBrowser.close()
    }
  } finally {
    await Promise.all(startedApps.map((app) => stopDesktopApp(app)))
  }
})

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address !== null && typeof address === 'object') {
          resolvePort(address.port)
          return
        }

        reject(new Error('Unable to allocate a TCP port'))
      })
    })
    server.on('error', reject)
  })
}

async function startDesktopApp(name: 'agent' | 'viewer', debugPort: number): Promise<RunningApp> {
  await mkdir(artifactDir, { recursive: true })
  const logFile = join(artifactDir, `${name}-${Date.now()}.log`)
  await writeFile(logFile, '')
  const logFd = openSync(logFile, 'a')

  const child = spawn(electronExecutable, [desktopRoot], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      APP_MODE: name,
      DESK_USER_DATA_SUFFIX: `e2e-${name}-${process.pid}-${Date.now()}`,
      DESK_DISPLAY_MEDIA_FALLBACK_SOURCE: 'screen:1:0',
      REMOTE_DEBUGGING_PORT: String(debugPort),
    },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  closeSync(logFd)

  if (child.pid === undefined) {
    throw new Error(`Failed to start ${name}: child pid is missing`)
  }

  const app = {
    name,
    process: child,
    processGroupId: child.pid,
    cdpEndpoint: '',
    logFile,
  }

  try {
    app.cdpEndpoint = await waitForDevToolsEndpoint(logFile, 45_000)
  } catch (error) {
    await stopDesktopApp(app)
    throw error
  }

  return app
}

async function stopDesktopApp(app: RunningApp): Promise<void> {
  killProcessGroup(app.processGroupId, 'SIGTERM')
  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      killProcessGroup(app.processGroupId, 'SIGKILL')
      resolveStop()
    }, 5_000)
    app.process.once('exit', () => {
      clearTimeout(timeout)
      resolveStop()
    })
  })
}

function killProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-processGroupId, signal)
  } catch {
    try {
      process.kill(processGroupId, signal)
    } catch {
      // Process may already be gone.
    }
  }
}

async function waitForDevToolsEndpoint(logFile: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let output = ''

  while (Date.now() < deadline) {
    output = await readFile(logFile, 'utf8')
    const endpoint = output.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]
    if (endpoint !== undefined) {
      return endpoint
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }

  throw new Error(`Timed out waiting for Electron DevTools endpoint. Output:\n${output}`)
}

async function waitForElectronPage(browser: Browser): Promise<Page> {
  await expect
    .poll(
      () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((page) => page.url()),
      { timeout: 20_000 },
    )
    .not.toBeUndefined()

  return browser.contexts().flatMap((context) => context.pages())[0] as Page
}

async function readAgentInfo(page: Page): Promise<{ code: string; port: number }> {
  return page.evaluate(() => {
    const text = document.body.innerText
    const code = text.match(/Pair code\s+([A-Z0-9]+)/)?.[1]
    const portText = text.match(/Address\s+[0-9.]+:(\d+)/)?.[1]

    if (code === undefined || portText === undefined) {
      throw new Error(`Unable to read agent pair info from UI: ${text}`)
    }

    return { code, port: Number(portText) }
  })
}
