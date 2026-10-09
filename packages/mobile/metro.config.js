// Expo SDK 52+ 自动配置 monorepo 的 watchFolders 与 nodeModulesPaths。
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// tsconfig 的 paths 只用于统一 @types/react，app.json 已关闭 tsconfigPaths，运行时解析由这里负责。
// 工作区包（如 klinechart-react）带着自己 devDependency 的 React 版本；
// 同一 bundle 里出现两份 React 会让 hooks 失效，因此这些包一律解析到本应用的副本。
const PINNED = ['react', 'react-dom', 'react-native', 'react-native-web']
const appOrigin = path.join(__dirname, 'package.json')
const upstreamResolve = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = PINNED.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))
  if (pinned) {
    return context.resolveRequest({ ...context, originModulePath: appOrigin }, moduleName, platform)
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = config
