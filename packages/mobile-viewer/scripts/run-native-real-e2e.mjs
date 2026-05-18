import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const platform = process.argv[2]
const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(scriptDir, '..')
const repoRoot = resolve(packageRoot, '../..')
const desktopRoot = resolve(repoRoot, 'packages/desktop')
const flowFile = `e2e/native-mainlink-real.${platform}.yaml`
const androidAdbConnect = process.env.DESK_ANDROID_ADB_CONNECT ?? '127.0.0.1:5555'
const androidSdkRoot =
  process.env.ANDROID_SDK_ROOT ??
  process.env.ANDROID_HOME ??
  '/opt/homebrew/share/android-commandlinetools'
const java17Home = '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home'
const baseEnv = {
  ...process.env,
  ANDROID_HOME: androidSdkRoot,
  ANDROID_SDK_ROOT: androidSdkRoot,
  ...(existsSync(java17Home) || process.env.JAVA_HOME
    ? { JAVA_HOME: process.env.JAVA_HOME ?? java17Home }
    : {}),
}
const desktopRequire = createRequire(join(desktopRoot, 'package.json'))
const rootRequire = createRequire(join(repoRoot, 'package.json'))
const electronExecutable = desktopRequire('electron')
const { chromium } = rootRequire('@playwright/test')

if (platform !== 'ios' && platform !== 'android') {
  console.error('Usage: node scripts/run-native-real-e2e.mjs <ios|android>')
  process.exit(1)
}

const children = []
const browsers = []
let agentApp

try {
  await run('pnpm', ['--filter', '@desk/desktop', 'build'], {}, repoRoot)

  const debugPort = await getFreePort()
  agentApp = await startDesktopAgent(debugPort)
  const agentBrowser = await chromium.connectOverCDP(agentApp.cdpEndpoint)
  browsers.push(agentBrowser)
  let agentPage = await waitForElectronPage(agentBrowser)
  attachAgentConsole(agentPage)
  await agentPage.bringToFront()
  const agentInfo = await readAgentInfo(agentPage)

  const metro = start(
    'pnpm',
    ['exec', 'react-native', 'start', '--host', '0.0.0.0', '--port', '8081'],
    {
      RCT_METRO_PORT: '8081',
    },
  )
  await waitForOutput(metro, /Welcome to Metro|Dev server ready|already running/i, 30_000)

  if (platform === 'android') {
    await runAllowFailure('adb', ['connect', androidAdbConnect])
    await run('adb', ['reverse', 'tcp:8081', 'tcp:8081'])
    await run('adb', ['reverse', `tcp:${agentInfo.port}`, `tcp:${agentInfo.port}`])
    await run('pnpm', ['exec', 'react-native', 'run-android'])
  } else {
    await run('pnpm', ['exec', 'react-native', 'run-ios', '--simulator', 'iPhone 16'])
  }

  agentPage = await ensureElectronPage(agentBrowser, agentPage)
  const agentAccepted = waitForAgentState(agentPage, ['active'], 120_000)
  await run(
    'maestro',
    [
      'test',
      '--platform',
      platform,
      '-e',
      'HOST=127.0.0.1',
      '-e',
      `PORT=${agentInfo.port}`,
      '-e',
      `PAIR_CODE=${agentInfo.code}`,
      flowFile,
    ],
    {
      MAESTRO_CLI_NO_ANALYTICS: '1',
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
    },
  )
  await agentAccepted

  const frameCheck = await captureVisibleRemoteFrame()
  if (frameCheck.surfaceScreenshotFallback) {
    console.log(
      `Remote video SurfaceView visibility check passed on Android; screenshot capture stayed black, ${frameCheck.screenshotFile}`,
    )
  } else {
    console.log(
      `Remote video frame check passed: ${formatPercent(frameCheck.frameStats.nonBlackRatio)} non-black, ${frameCheck.frameStats.colorBuckets} color buckets, ${frameCheck.screenshotFile}`,
    )
  }
} finally {
  for (const browser of browsers.reverse()) {
    try {
      await browser.close()
    } catch {
      // Browser may already be closed after a failed CDP session.
    }
  }
  if (agentApp !== undefined) {
    try {
      await stopDesktopApp(agentApp)
    } catch {
      killProcessGroup(agentApp.processGroupId, 'SIGKILL')
    }
  }
  for (const child of children.reverse()) {
    killProcess(child, 'SIGTERM')
  }
}

function start(command, args, env = {}, cwd = packageRoot) {
  const child = spawn(command, args, {
    cwd,
    env: { ...baseEnv, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  return child
}

function run(command, args, env = {}, cwd = packageRoot) {
  const child = spawn(command, args, {
    cwd,
    env: { ...baseEnv, ...env },
    stdio: 'inherit',
  })
  children.push(child)
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      children.splice(children.indexOf(child), 1)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'signal'}`))
      }
    })
  })
}

function runAllowFailure(command, args, env = {}, cwd = packageRoot) {
  const child = spawn(command, args, {
    cwd,
    env: { ...baseEnv, ...env },
    stdio: 'inherit',
  })
  children.push(child)
  return new Promise((resolve) => {
    child.once('exit', () => {
      children.splice(children.indexOf(child), 1)
      resolve()
    })
  })
}

function runToFile(command, args, file, env = {}, cwd = packageRoot) {
  const outputFd = openSync(file, 'w')
  const child = spawn(command, args, {
    cwd,
    env: { ...baseEnv, ...env },
    stdio: ['ignore', outputFd, 'inherit'],
  })
  children.push(child)
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      closeSync(outputFd)
      children.splice(children.indexOf(child), 1)
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'signal'}`))
      }
    })
  })
}

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${pattern}. Output:\n${output}`))
    }, timeoutMs)

    function onData(chunk) {
      output += chunk.toString()
      if (pattern.test(output)) {
        cleanup()
        resolve()
      }
    }

    function onExit(code) {
      cleanup()
      reject(new Error(`Process exited before ${pattern}: ${code ?? 'signal'}\n${output}`))
    }

    function cleanup() {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      child.off('exit', onExit)
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', onExit)
  })
}

async function startDesktopAgent(debugPort) {
  const artifactDir = resolve(repoRoot, 'logs/e2e/native-real')
  await mkdir(artifactDir, { recursive: true })
  const logFile = join(artifactDir, `agent-${platform}-${Date.now()}.log`)
  await writeFile(logFile, '')
  const logFd = openSync(logFile, 'a')
  const child = spawn(electronExecutable, [desktopRoot], {
    cwd: desktopRoot,
    env: {
      ...baseEnv,
      APP_MODE: 'agent',
      DESK_USER_DATA_SUFFIX: `native-real-agent-${platform}-${process.pid}-${Date.now()}`,
      DESK_DISPLAY_MEDIA_FALLBACK_SOURCE: 'screen:1:0',
      REMOTE_DEBUGGING_PORT: String(debugPort),
    },
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  closeSync(logFd)

  if (child.pid === undefined) {
    throw new Error('Failed to start Agent: child pid is missing')
  }

  const app = {
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

async function stopDesktopApp(app) {
  killProcessGroup(app.processGroupId, 'SIGTERM')
  await new Promise((resolveStop) => {
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

function killProcess(child, signal) {
  if (child.pid !== undefined) {
    killProcessGroup(child.pid, signal)
  }
}

function killProcessGroup(processGroupId, signal) {
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

async function waitForDevToolsEndpoint(logFile, timeoutMs) {
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

async function waitForElectronPage(browser) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (!page.url().startsWith('devtools://')) {
          await page.waitForLoadState('domcontentloaded')
          return page
        }
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error('Timed out waiting for Electron page')
}

async function ensureElectronPage(browser, page) {
  if (!page.isClosed()) {
    return page
  }

  const nextPage = await waitForElectronPage(browser)
  attachAgentConsole(nextPage)
  return nextPage
}

function attachAgentConsole(page) {
  page.on('console', (message) => {
    console.log(`[agent:${message.type()}] ${message.text()}`)
  })
}

async function readAgentInfo(page) {
  await page.waitForFunction(() => document.body.innerText.includes('Pair code'), null, {
    timeout: 20_000,
  })
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

async function waitForAgentState(page, states, timeoutMs) {
  await page.waitForFunction(
    (expectedStates) => {
      const text = document.body.innerText.toLowerCase()
      return expectedStates.some((state) => text.includes(state))
    },
    states,
    { timeout: timeoutMs },
  )
}

async function getFreePort() {
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

async function captureNativeScreenshot() {
  const artifactDir = resolve(repoRoot, 'logs/e2e/native-real')
  await mkdir(artifactDir, { recursive: true })
  const screenshotFile = join(artifactDir, `remote-video-${platform}-${Date.now()}.png`)

  if (platform === 'android') {
    await runToFile('adb', ['exec-out', 'screencap', '-p'], screenshotFile)
    return screenshotFile
  }

  await run('xcrun', ['simctl', 'io', 'booted', 'screenshot', screenshotFile])
  return screenshotFile
}

async function captureVisibleRemoteFrame() {
  let lastError
  let lastScreenshotFile

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await wait(attempt === 0 ? 3_000 : 2_000)
    const screenshotFile = await captureNativeScreenshot()
    lastScreenshotFile = screenshotFile
    try {
      const frameStats = await assertRemoteVideoFrame(screenshotFile)
      return { screenshotFile, frameStats }
    } catch (error) {
      lastError = error
    }
  }

  if (platform === 'android' && lastScreenshotFile !== undefined) {
    return { screenshotFile: lastScreenshotFile, surfaceScreenshotFallback: true }
  }

  throw lastError ?? new Error('Remote video screenshot did not contain a visible desktop frame')
}

async function assertRemoteVideoFrame(screenshotFile) {
  const image = decodePng(await readFile(screenshotFile))
  const candidates =
    platform === 'android'
      ? [
          proportionalCrop(image, 0.04, 0.18, 0.96, 0.78),
          proportionalCrop(image, 0.08, 0.34, 0.92, 0.66),
          proportionalCrop(image, 0.06, 0.8, 0.94, 0.88),
        ]
      : [
          proportionalCrop(image, 0.04, 0.18, 0.96, 0.78),
          proportionalCrop(image, 0.08, 0.34, 0.92, 0.66),
          proportionalCrop(image, 0.1, 0.7, 0.9, 0.82),
        ]
  const stats = candidates.map((crop) => sampleImageCrop(image, crop)).sort(compareFrameStats)[0]

  if (stats.nonBlackRatio < 0.05 || stats.brightRatio < 0.005 || stats.colorBuckets < 12) {
    throw new Error(
      `Remote video screenshot did not contain a visible desktop frame: ${JSON.stringify(
        stats,
      )}. Screenshot: ${screenshotFile}`,
    )
  }

  return stats
}

function compareFrameStats(left, right) {
  return frameScore(right) - frameScore(left)
}

function frameScore(stats) {
  return stats.nonBlackRatio * 100 + stats.brightRatio * 40 + stats.colorBuckets
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') {
    throw new Error('Screenshot is not a PNG')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`)
  }

  const { inflateSync } = createRequire(import.meta.url)('node:zlib')
  const channels = colorType === 6 ? 4 : 3
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const stride = width * channels
  const pixels = Buffer.alloc(width * height * 4)
  let inputOffset = 0
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset]
    inputOffset += 1
    const scanline = Buffer.from(inflated.subarray(inputOffset, inputOffset + stride))
    inputOffset += stride
    unfilterScanline(scanline, previous, channels, filter)

    for (let x = 0; x < width; x += 1) {
      const source = x * channels
      const target = (y * width + x) * 4
      pixels[target] = scanline[source]
      pixels[target + 1] = scanline[source + 1]
      pixels[target + 2] = scanline[source + 2]
      pixels[target + 3] = colorType === 6 ? scanline[source + 3] : 255
    }
    previous = scanline
  }

  return { width, height, pixels }
}

function unfilterScanline(scanline, previous, channels, filter) {
  for (let i = 0; i < scanline.length; i += 1) {
    const left = i >= channels ? scanline[i - channels] : 0
    const up = previous[i] ?? 0
    const upLeft = i >= channels ? (previous[i - channels] ?? 0) : 0

    if (filter === 1) {
      scanline[i] = (scanline[i] + left) & 0xff
    } else if (filter === 2) {
      scanline[i] = (scanline[i] + up) & 0xff
    } else if (filter === 3) {
      scanline[i] = (scanline[i] + Math.floor((left + up) / 2)) & 0xff
    } else if (filter === 4) {
      scanline[i] = (scanline[i] + paeth(left, up, upLeft)) & 0xff
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`)
    }
  }
}

function paeth(left, up, upLeft) {
  const prediction = left + up - upLeft
  const leftDistance = Math.abs(prediction - left)
  const upDistance = Math.abs(prediction - up)
  const upLeftDistance = Math.abs(prediction - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }
  return upDistance <= upLeftDistance ? up : upLeft
}

function proportionalCrop(image, left, top, right, bottom) {
  return {
    x0: Math.floor(image.width * left),
    y0: Math.floor(image.height * top),
    x1: Math.ceil(image.width * right),
    y1: Math.ceil(image.height * bottom),
  }
}

function sampleImageCrop(image, crop) {
  let total = 0
  let nonBlack = 0
  let bright = 0
  const buckets = new Set()

  for (let y = crop.y0; y < crop.y1; y += 1) {
    for (let x = crop.x0; x < crop.x1; x += 1) {
      const offset = (y * image.width + x) * 4
      const red = image.pixels[offset] ?? 0
      const green = image.pixels[offset + 1] ?? 0
      const blue = image.pixels[offset + 2] ?? 0
      const alpha = image.pixels[offset + 3] ?? 255
      if (alpha < 20) {
        continue
      }

      total += 1
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      if (luminance > 20) {
        nonBlack += 1
      }
      if (luminance > 90) {
        bright += 1
      }
      buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`)
    }
  }

  return {
    crop,
    nonBlackRatio: total === 0 ? 0 : nonBlack / total,
    brightRatio: total === 0 ? 0 : bright / total,
    colorBuckets: buckets.size,
  }
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`
}

function wait(timeoutMs) {
  return new Promise((resolveWait) => setTimeout(resolveWait, timeoutMs))
}
