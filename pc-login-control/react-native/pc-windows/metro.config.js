const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// --- monorepo 対応 ---
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

/**
 * @pclc/core を含むワークスペースの解決設定
 * https://reactnative.dev/docs/set-up-your-environment（monorepo）を参照
 */
const config = {
  projectRoot,
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
