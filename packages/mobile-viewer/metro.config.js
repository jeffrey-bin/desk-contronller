const path = require('node:path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const defaultConfig = getDefaultConfig(__dirname)
const sourceRoots = [
  path.join(workspaceRoot, 'shared/src'),
  path.join(workspaceRoot, 'packages/signaling/src'),
  path.join(projectRoot, 'src'),
]

function resolveSourceJsRequest(context, moduleName, platform) {
  const originModulePath = context.originModulePath ?? ''
  const isWorkspaceSource = sourceRoots.some((sourceRoot) =>
    originModulePath.startsWith(`${sourceRoot}${path.sep}`),
  )

  if (isWorkspaceSource && moduleName.endsWith('.js') && moduleName.startsWith('.')) {
    const sourceModuleName = moduleName.slice(0, -3)

    try {
      return context.resolveRequest(context, `${sourceModuleName}.ts`, platform)
    } catch {
      return context.resolveRequest(context, `${sourceModuleName}.tsx`, platform)
    }
  }

  return context.resolveRequest(context, moduleName, platform)
}

const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: new Proxy(
      {},
      {
        get: (_target, name) => path.join(projectRoot, `node_modules/${String(name)}`),
      },
    ),
    resolveRequest: resolveSourceJsRequest,
  },
}

module.exports = mergeConfig(defaultConfig, config)
