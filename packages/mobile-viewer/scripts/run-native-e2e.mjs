import { spawn } from 'node:child_process'
import process from 'node:process'

const platform = process.argv[2]
const packageRoot = new URL('..', import.meta.url).pathname
const port = process.env.DESK_MOBILE_E2E_PORT ?? '49831'
const pairCode = process.env.DESK_MOBILE_E2E_PAIR_CODE ?? 'RNM2E2'
const appId = 'com.deskcontroller.mobileviewer'

if (platform !== 'ios' && platform !== 'android') {
  console.error('Usage: node scripts/run-native-e2e.mjs <ios|android>')
  process.exit(1)
}

const children = []

try {
  const fixture = start('node', ['scripts/native-mainlink-server.mjs'], {
    DESK_MOBILE_E2E_PORT: port,
    DESK_MOBILE_E2E_ROOM: pairCode,
    DESK_MOBILE_E2E_PAIR_CODE: pairCode,
  })
  await waitForOutput(fixture, /"event":"ready"/, 10_000)

  const metro = start(
    'pnpm',
    ['exec', 'react-native', 'start', '--host', '0.0.0.0', '--port', '8081'],
    {
      RCT_METRO_PORT: '8081',
    },
  )
  await waitForOutput(metro, /Welcome to Metro|Dev server ready|ready/i, 30_000)

  if (platform === 'android') {
    await run('adb', ['reverse', 'tcp:8081', 'tcp:8081'])
    await run('adb', ['reverse', `tcp:${port}`, `tcp:${port}`])
    await run('pnpm', ['exec', 'react-native', 'run-android'])
  } else {
    await run('pnpm', ['exec', 'react-native', 'run-ios', '--simulator', 'iPhone 16'])
  }

  await run('maestro', ['test', 'e2e/native-mainlink.yaml'], {
    HOST: '127.0.0.1',
    PORT: port,
    PAIR_CODE: pairCode,
    MAESTRO_CLI_NO_ANALYTICS: '1',
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  })
} finally {
  for (const child of children.reverse()) {
    child.kill('SIGTERM')
  }
}

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))
  return child
}

function run(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: packageRoot,
    env: { ...process.env, ...env },
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

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${pattern}`))
    }, timeoutMs)

    const handle = (chunk) => {
      if (pattern.test(String(chunk))) {
        clearTimeout(timer)
        child.stdout.off('data', handle)
        child.stderr.off('data', handle)
        resolve()
      }
    }

    child.stdout.on('data', handle)
    child.stderr.on('data', handle)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Process exited before ${pattern}: ${code ?? 'signal'}`))
    })
  })
}
