/* global console */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseRoot = join(repoRoot, 'release')
const args = process.argv.slice(2)
const tag = args.find((arg) => !arg.startsWith('-'))
const flags = new Set(args.filter((arg) => arg.startsWith('-')))
const dryRun = flags.has('--dry-run')
const allowDirty = flags.has('--allow-dirty')
const publish = flags.has('--publish')
const draft = flags.has('--draft') || !publish
const prerelease = flags.has('--prerelease')

if (flags.has('--help') || flags.has('-h')) {
  console.error(
    [
      'Usage: pnpm release:github <tag> [--draft|--publish] [--prerelease] [--dry-run] [--allow-dirty]',
      '',
      'Examples:',
      '  pnpm release:github v0.1.0 --dry-run',
      '  pnpm release:github v0.1.0 --draft',
      '  pnpm release:github v0.1.0 --publish',
    ].join('\n'),
  )
  process.exit(0)
}

if (!tag) {
  console.error('Missing release tag. Example: pnpm release:github v0.1.0 --draft')
  process.exit(1)
}

if (!existsSync(releaseRoot)) {
  console.error('Missing release/. Run `pnpm release:build` first.')
  process.exit(1)
}

const assets = findReleaseAssets()
if (assets.length === 0) {
  console.error('No release assets found. Run `pnpm release:build` first.')
  process.exit(1)
}

if (!allowDirty) {
  const status = runCapture('git', ['status', '--short'])
  if (status.stdout.trim()) {
    console.error('Git working tree is not clean. Commit or stash changes before publishing.')
    process.exit(1)
  }
}

if (dryRun) {
  printPlan()
  process.exit(0)
}

ensureCommand(
  'gh',
  ['--version'],
  'GitHub CLI `gh` is required. Install it and run `gh auth login`.',
)
ensureCommand('gh', ['auth', 'status'], '`gh` is not authenticated. Run `gh auth login` first.')

if (!tagExists(tag)) {
  run('git', ['tag', '-a', tag, '-m', `Release ${tag}`])
}
run('git', ['push', 'origin', tag])

if (githubReleaseExists(tag)) {
  run('gh', ['release', 'upload', tag, ...assets, '--clobber'])
  console.info(`Updated GitHub Release assets for ${tag}.`)
} else {
  const releaseArgs = [
    'release',
    'create',
    tag,
    ...assets,
    '--title',
    `Desk Controller ${tag}`,
    '--notes-file',
    releaseNotesFile(),
  ]
  if (draft) {
    releaseArgs.push('--draft')
  }
  if (prerelease) {
    releaseArgs.push('--prerelease')
  }
  run('gh', releaseArgs)
  console.info(`Created GitHub Release ${tag}${draft ? ' as draft' : ''}.`)
}

function findReleaseAssets() {
  return readdirSync(releaseRoot)
    .map((name) => join(releaseRoot, name))
    .filter((path) => statSync(path).isFile())
    .filter((path) => {
      const name = basename(path)
      return (
        name.endsWith('.zip') ||
        name.endsWith('.apk') ||
        name.endsWith('.ipa') ||
        name === 'README.md' ||
        name === 'README.zh-CN.md'
      )
    })
    .sort()
}

function releaseNotesFile() {
  const chinese = join(releaseRoot, 'README.zh-CN.md')
  return existsSync(chinese) ? chinese : join(releaseRoot, 'README.md')
}

function printPlan() {
  console.info(`GitHub Release dry run: ${tag}`)
  console.info(`Mode: ${draft ? 'draft' : 'publish'}${prerelease ? ', prerelease' : ''}`)
  console.info('Assets:')
  for (const asset of assets) {
    console.info(`- ${asset}`)
  }
  console.info('Commands that would run:')
  if (!tagExists(tag)) {
    console.info(`- git tag -a ${tag} -m "Release ${tag}"`)
  }
  console.info(`- git push origin ${tag}`)
  console.info(`- gh release create/upload ${tag}`)
}

function tagExists(tagName) {
  return (
    spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tagName}`], {
      cwd: repoRoot,
      stdio: 'ignore',
    }).status === 0
  )
}

function githubReleaseExists(tagName) {
  return (
    spawnSync('gh', ['release', 'view', tagName], {
      cwd: repoRoot,
      stdio: 'ignore',
    }).status === 0
  )
}

function ensureCommand(command, commandArgs, message) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    console.error(message)
    if (result.stderr.trim()) {
      console.error(result.stderr.trim())
    }
    process.exit(1)
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runCapture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    console.error(result.stderr.trim())
    process.exit(result.status ?? 1)
  }
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}
