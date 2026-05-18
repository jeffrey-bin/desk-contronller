import { packager } from '@electron/packager'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

const packageRoot = resolve(new URL('..', import.meta.url).pathname)
const repoRoot = resolve(packageRoot, '../..')
const iconRoot = join(packageRoot, 'build/icons')
const outRoot = join(repoRoot, 'dist/desktop')
const arch = process.env.DESK_PACKAGE_ARCH ?? process.arch

const targets = {
  agent: {
    appBundleId: 'com.deskcontroller.agent',
    name: 'Desk Controller Agent',
    icon: join(iconRoot, 'agent.icns'),
  },
  viewer: {
    appBundleId: 'com.deskcontroller.viewer',
    name: 'Desk Controller Viewer',
    icon: join(iconRoot, 'viewer.icns'),
  },
}

const requested = process.argv.slice(2)
const selected =
  requested.length === 0 || requested.includes('all')
    ? Object.keys(targets)
    : requested.filter((target) => Object.hasOwn(targets, target))

if (selected.length === 0) {
  console.error('Usage: node packages/desktop/scripts/package-desktop.mjs [agent|viewer|all]')
  process.exit(1)
}

if (!existsSync(join(packageRoot, 'out/main/index.js'))) {
  console.error('Desktop build output missing. Run `pnpm --filter @desk/desktop build` first.')
  process.exit(1)
}

await mkdir(outRoot, { recursive: true })

for (const target of selected) {
  const config = targets[target]
  const icon = existsSync(config.icon) ? config.icon : config.icon.replace(/\.icns$/, '.png')

  const appPaths = await packager({
    appBundleId: config.appBundleId,
    appCategoryType: 'public.app-category.productivity',
    arch,
    asar: false,
    darwinDarkModeSupport: true,
    dir: packageRoot,
    icon,
    ignore: [
      /^\/\.package($|\/)/,
      /^\/build\/icons\/.*\.iconset($|\/)/,
      /^\/electron\.vite\.config\.ts$/,
      /^\/playwright-report($|\/)/,
      /^\/scripts($|\/)/,
      /^\/src($|\/)/,
      /^\/test-results($|\/)/,
      /^\/tests($|\/)/,
      /^\/tsconfig\..*\.json$/,
    ],
    name: config.name,
    osxSign: false,
    out: outRoot,
    overwrite: true,
    platform: 'darwin',
    prune: false,
    quiet: true,
  })

  for (const appPath of appPaths) {
    console.log(`${target}: ${appPath}`)
  }
}
