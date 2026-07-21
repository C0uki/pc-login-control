const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// --- monorepo 対応 ---
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

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
