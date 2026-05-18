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
  },
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
