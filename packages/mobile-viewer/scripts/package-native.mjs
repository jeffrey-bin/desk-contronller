/* global console */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidSdkRoot =
  process.env.ANDROID_SDK_ROOT ??
  process.env.ANDROID_HOME ??
  '/opt/homebrew/share/android-commandlinetools'
const java17Home = '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home'
const iosBuildRoot = resolve(packageRoot, 'ios/build')
const iosExportMethod = process.env.IOS_EXPORT_METHOD ?? 'app-store-connect'
const iosArchivePath =
  process.env.IOS_ARCHIVE_PATH ?? join(iosBuildRoot, 'Archive/DeskMobileViewer.xcarchive')
const iosExportPath = process.env.IOS_EXPORT_PATH ?? join(iosBuildRoot, `Export/${iosExportMethod}`)
const iosExportOptionsPath =
  process.env.IOS_EXPORT_OPTIONS_PLIST ??
  join(iosBuildRoot, `ExportOptions-${iosExportMethod}.plist`)
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
} else if (target === 'ios-ipa') {
  warnIfSigningLooksUnavailable()
  mkdirSync(dirname(iosArchivePath), { recursive: true })
  mkdirSync(iosExportPath, { recursive: true })
  mkdirSync(dirname(iosExportOptionsPath), { recursive: true })
  writeFileSync(iosExportOptionsPath, createExportOptionsPlist(), 'utf8')

  const sharedArgs = [
    '-workspace',
    'ios/DeskMobileViewer.xcworkspace',
    '-scheme',
    'DeskMobileViewer',
    '-configuration',
    'Release',
  ]
  const xcodeArgs = process.env.IOS_XCODEBUILD_QUIET === '0' ? [] : ['-quiet']
  const provisioningArgs = createProvisioningArgs()
  const signingBuildSettings = createSigningBuildSettings()

  await run(
    'xcodebuild',
    [
      ...xcodeArgs,
      ...sharedArgs,
      '-sdk',
      'iphoneos',
      '-archivePath',
      iosArchivePath,
      ...provisioningArgs,
      ...signingBuildSettings,
      'archive',
    ],
    packageRoot,
  )

  await run(
    'xcodebuild',
    [
      ...xcodeArgs,
      '-exportArchive',
      '-archivePath',
      iosArchivePath,
      '-exportPath',
      iosExportPath,
      '-exportOptionsPlist',
      iosExportOptionsPath,
      ...provisioningArgs,
    ],
    packageRoot,
  )

  const ipa = findFirstFile(iosExportPath, (name) => name.endsWith('.ipa'))
  if (!ipa) {
    throw new Error(`iOS export finished but no .ipa was found in ${iosExportPath}`)
  }
  console.info(`ios-ipa: ${ipa}`)
} else {
  console.error('Usage: node scripts/package-native.mjs <android|ios-sim|ios-ipa>')
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

function createProvisioningArgs() {
  const args = []
  if (process.env.IOS_ALLOW_PROVISIONING_UPDATES !== '0') {
    args.push('-allowProvisioningUpdates')
  }

  const keyPath = process.env.ASC_KEY_PATH
  const keyId = process.env.ASC_KEY_ID
  const issuerId = process.env.ASC_ISSUER_ID
  if (keyPath || keyId || issuerId) {
    if (!keyPath || !keyId || !issuerId) {
      throw new Error('ASC_KEY_PATH, ASC_KEY_ID, and ASC_ISSUER_ID must be provided together.')
    }
    args.push(
      '-authenticationKeyPath',
      keyPath,
      '-authenticationKeyID',
      keyId,
      '-authenticationKeyIssuerID',
      issuerId,
    )
  }
  return args
}

function createSigningBuildSettings() {
  return [
    ['IOS_TEAM_ID', 'DEVELOPMENT_TEAM'],
    ['IOS_BUNDLE_ID', 'PRODUCT_BUNDLE_IDENTIFIER'],
    ['IOS_CODE_SIGN_STYLE', 'CODE_SIGN_STYLE'],
    ['IOS_PROVISIONING_PROFILE_SPECIFIER', 'PROVISIONING_PROFILE_SPECIFIER'],
    ['IOS_MARKETING_VERSION', 'MARKETING_VERSION'],
    ['IOS_BUILD_NUMBER', 'CURRENT_PROJECT_VERSION'],
  ].flatMap(([envName, settingName]) => {
    const value = process.env[envName]
    return value ? [`${settingName}=${value}`] : []
  })
}

function createExportOptionsPlist() {
  const teamId = process.env.IOS_TEAM_ID
  const bundleId = process.env.IOS_BUNDLE_ID ?? 'com.deskcontroller.mobileviewer'
  const signingStyle = process.env.IOS_SIGNING_STYLE ?? 'automatic'
  const provisioningProfile = process.env.IOS_PROVISIONING_PROFILE_SPECIFIER

  const optionalEntries = [
    teamId ? plistKey('teamID', teamId) : '',
    plistKey('signingStyle', signingStyle),
    process.env.IOS_UPLOAD_SYMBOLS === '0'
      ? plistBool('uploadSymbols', false)
      : plistBool('uploadSymbols', true),
    process.env.IOS_MANAGE_VERSION === '0'
      ? plistBool('manageAppVersionAndBuildNumber', false)
      : plistBool('manageAppVersionAndBuildNumber', true),
    process.env.IOS_TESTFLIGHT_INTERNAL_ONLY === '1'
      ? plistBool('testFlightInternalTestingOnly', true)
      : '',
    provisioningProfile
      ? [
          '\t<key>provisioningProfiles</key>',
          '\t<dict>',
          `\t\t<key>${escapeXml(bundleId)}</key>`,
          `\t\t<string>${escapeXml(provisioningProfile)}</string>`,
          '\t</dict>',
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${plistKey('method', iosExportMethod)}
${plistKey('destination', process.env.IOS_EXPORT_DESTINATION ?? 'export')}
${plistBool('stripSwiftSymbols', true)}
${optionalEntries}
</dict>
</plist>
`
}

function plistKey(key, value) {
  return `\t<key>${escapeXml(key)}</key>\n\t<string>${escapeXml(value)}</string>`
}

function plistBool(key, value) {
  return `\t<key>${escapeXml(key)}</key>\n\t<${value ? 'true' : 'false'}/>`
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function findFirstFile(root, predicate) {
  if (!existsSync(root)) {
    return undefined
  }
  for (const name of readdirSync(root)) {
    const candidate = join(root, name)
    const stats = statSync(candidate)
    if (stats.isDirectory()) {
      const nested = findFirstFile(candidate, predicate)
      if (nested) {
        return nested
      }
    } else if (predicate(name)) {
      return candidate
    }
  }
  return undefined
}

function warnIfSigningLooksUnavailable() {
  if (process.env.ASC_KEY_PATH || process.env.IOS_SKIP_SIGNING_PREFLIGHT === '1') {
    return
  }

  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })
  if ((result.stdout ?? '').includes('0 valid identities found')) {
    console.warn(
      'Warning: no local code signing identity found. `ios-ipa` requires an Apple Distribution certificate/provisioning profile or App Store Connect API credentials.',
    )
  }
}
