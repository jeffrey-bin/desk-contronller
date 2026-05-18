import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const target = process.argv[2]
const packageRoot = resolve(new URL('..', import.meta.url).pathname)
const androidSdkRoot =
  process.env.ANDROID_SDK_ROOT ??
  process.env.ANDROID_HOME ??
  '/opt/homebrew/share/android-commandlinetools'
const java17Home = '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home'
const env = {
  ...process.env,
  ANDROID_HOME: androidSdkRoot,
  ANDROID_SDK_ROOT: androidSdkRoot,
  ...(existsSync(java17Home) || process.env.JAVA_HOME
    ? { JAVA_HOME: process.env.JAVA_HOME ?? java17Home }
    : {}),
}

if (target === 'android') {
  await run('./gradlew', ['assembleRelease'], resolve(packageRoot, 'android'))
} else if (target === 'ios-sim') {
  await run(
    'xcodebuild',
    [
      '-quiet',
      '-workspace',
      'ios/DeskMobileViewer.xcworkspace',
      '-scheme',
      'DeskMobileViewer',
      '-configuration',
      'Release',
      '-sdk',
      'iphonesimulator',
      '-derivedDataPath',
      'ios/build',
    ],
    packageRoot,
  )
} else {
  console.error('Usage: node scripts/package-native.mjs <android|ios-sim>')
  process.exit(1)
}

function run(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })

  return new Promise((resolveRun, reject) => {
    child.once('exit', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? 'signal'}`))
    })
  })
}
