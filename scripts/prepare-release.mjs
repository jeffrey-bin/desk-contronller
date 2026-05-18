/* global console */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = join(repoRoot, 'release')
const artifacts = []

mkdirSync(releaseRoot, { recursive: true })

zipDirectory(
  findFirst(join(repoRoot, 'dist/desktop'), (name) => name === 'Desk Controller Agent.app'),
  join(releaseRoot, `DeskController-Agent-mac-${process.arch}.zip`),
  'macOS Agent app',
)
zipDirectory(
  findFirst(join(repoRoot, 'dist/desktop'), (name) => name === 'Desk Controller Viewer.app'),
  join(releaseRoot, `DeskController-Viewer-mac-${process.arch}.zip`),
  'macOS Viewer app',
)
copyFile(
  join(repoRoot, 'packages/mobile-viewer/android/app/build/outputs/apk/release/app-release.apk'),
  join(releaseRoot, 'DeskMobileViewer-Android-release.apk'),
  'Android release APK',
)
zipDirectory(
  join(
    repoRoot,
    'packages/mobile-viewer/ios/build/Build/Products/Release-iphonesimulator/DeskMobileViewer.app',
  ),
  join(releaseRoot, 'DeskMobileViewer-iOS-Simulator.zip'),
  'iOS Simulator app',
)

const ipa = findFirst(join(repoRoot, 'packages/mobile-viewer/ios/build/Export'), (name) =>
  name.endsWith('.ipa'),
)
if (ipa) {
  copyFile(ipa, join(releaseRoot, 'DeskMobileViewer-iOS-AppStore.ipa'), 'iOS App Store IPA')
} else {
  artifacts.push({
    label: 'iOS App Store IPA',
    path: 'not generated',
    ready: false,
    note: 'Run `pnpm package:ios:ipa` on a Mac with Apple signing credentials, then rerun `pnpm release:prepare`.',
  })
}

writeFileSync(join(releaseRoot, 'README.md'), createReleaseReadme(), 'utf8')

for (const artifact of artifacts) {
  const status = artifact.ready ? 'OK' : 'MISSING'
  console.info(`${status} ${artifact.label}: ${artifact.path}`)
  if (artifact.note) {
    console.info(`  ${artifact.note}`)
  }
}
console.info(`release: ${releaseRoot}`)

function copyFile(source, destination, label) {
  if (!source || !existsSync(source)) {
    artifacts.push({ label, path: source ?? 'not found', ready: false })
    return
  }
  copyFileSync(source, destination)
  artifacts.push({ label, path: destination, ready: true })
}

function zipDirectory(source, destination, label) {
  if (!source || !existsSync(source)) {
    artifacts.push({ label, path: source ?? 'not found', ready: false })
    return
  }
  const result = spawnSync(
    'ditto',
    ['-c', '-k', '--sequesterRsrc', '--keepParent', source, destination],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    artifacts.push({
      label,
      path: destination,
      ready: false,
      note: result.stderr.trim() || `ditto exited with ${result.status ?? 'signal'}`,
    })
    return
  }
  artifacts.push({ label, path: destination, ready: true })
}

function findFirst(root, predicate) {
  if (!existsSync(root)) {
    return undefined
  }
  for (const name of readdirSync(root)) {
    const candidate = join(root, name)
    const stats = statSync(candidate)
    if (predicate(name, candidate, stats)) {
      return candidate
    }
    if (stats.isDirectory()) {
      const nested = findFirst(candidate, predicate)
      if (nested) {
        return nested
      }
    }
  }
  return undefined
}

function createReleaseReadme() {
  const lines = [
    '# Desk Controller Release Bundle',
    '',
    `Generated from ${basename(repoRoot)} on ${new Date().toISOString()}.`,
    '',
    '## Artifacts',
    '',
    ...artifacts.map((artifact) =>
      artifact.ready
        ? `- ${artifact.label}: \`${basename(artifact.path)}\``
        : `- ${artifact.label}: missing. ${artifact.note ?? ''}`.trim(),
    ),
    '',
    '## Desktop smoke test',
    '',
    '1. Unzip `DeskController-Agent-mac-*.zip` and `DeskController-Viewer-mac-*.zip` on a Mac on the same LAN.',
    '2. Open Agent first for the simplest path. Grant Screen Recording and Accessibility when macOS asks, then restart Agent if the permission dialog requires it.',
    '3. Open Viewer, choose the discovered Agent or enter its LAN host and port, then enter the 6-character pairing code.',
    '4. Confirm the remote screen appears, mouse movement/click/scroll work, text input reaches the Agent, and Disconnect returns both apps to pairing/idle.',
    '',
    '## Android smoke test',
    '',
    '1. Install `DeskMobileViewer-Android-release.apk` on BlueStacks or a physical Android device.',
    '2. Start the desktop Agent on the same LAN.',
    '3. Open the Android Viewer, enter the Agent host, port, and pairing code, then connect.',
    '4. Confirm the Agent screen fills the phone viewport after streaming starts.',
    '',
    '## iOS smoke test',
    '',
    'Simulator path:',
    '',
    '1. Unzip `DeskMobileViewer-iOS-Simulator.zip`.',
    '2. Boot an iOS Simulator.',
    '3. Run `xcrun simctl install booted DeskMobileViewer.app` from the unzipped directory.',
    '4. Start desktop Agent, open the app in Simulator, enter host, port, and pairing code, then confirm full-screen streaming.',
    '',
    'TestFlight/App Store path:',
    '',
    '1. Build a signed IPA with `pnpm package:ios:ipa` on a Mac that has Apple Distribution signing configured.',
    '2. Rerun `pnpm release:prepare`; it will copy `DeskMobileViewer-iOS-AppStore.ipa` into this directory.',
    '3. Upload that IPA to App Store Connect or Transporter, then install through TestFlight.',
    '',
  ]
  return `${lines.join('\n')}\n`
}
