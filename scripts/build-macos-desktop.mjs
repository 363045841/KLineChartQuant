/** 在 Mac 上按 CPU 架构编译后端、前端并生成 macOS 13+ 的 DMG。 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { macosDesktopTarget } from './macos-desktop-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const desktop = path.join(root, 'packages/desktop-electron')
const { values } = parseArgs({
  options: {
    arch: { type: 'string', default: process.arch },
  },
})
if (process.platform !== 'darwin') throw new Error('build:mac 需要在 macOS 上运行')
if (!macosDesktopTarget.architectures.includes(values.arch)) {
  throw new Error(`Mac 架构只能是 ${macosDesktopTarget.architectures.join(' / ')}`)
}

/** 在桌面包目录执行构建命令，保留完整输出并传播失败。 */
function run(command, args) {
  execFileSync(command, args, { cwd: desktop, stdio: 'inherit' })
}

// 本目录仅存放生成的二进制；切换架构时清掉上一次构建，避免混入其他架构的后端。
rmSync(path.join(desktop, 'resources/backends'), { recursive: true, force: true })
run(process.execPath, [
  path.join(root, 'scripts/build-backends.mjs'),
  '--target',
  `darwin-${values.arch}`,
])
run('pnpm', ['exec', 'electron-vite', 'build'])

// 使用 JSON 保留 "13.0" 字符串；CLI 点号参数会把它们解析成数值。
const configDirectory = path.join(root, 'node_modules/.tmp/desktop-macos')
mkdirSync(configDirectory, { recursive: true })
const configFile = path.join(configDirectory, `${macosDesktopTarget.label}-${values.arch}.json`)
writeFileSync(
  configFile,
  JSON.stringify({
    extends: path.join(desktop, 'electron-builder.yml'),
    mac: {
      minimumSystemVersion: macosDesktopTarget.minimumSystemVersion,
      artifactName: `\${productName}-\${version}-${macosDesktopTarget.label}-\${arch}.\${ext}`,
    },
  }),
)
run('pnpm', [
  'exec',
  'electron-builder',
  '--mac',
  'dmg',
  `--${values.arch}`,
  '--publish',
  'never',
  '--config',
  configFile,
])

// electron-builder 的 Mac 输出目录按架构区分：x64 是 mac，arm64 是 mac-arm64。
const outputDirectory = path.join(desktop, 'dist', values.arch === 'arm64' ? 'mac-arm64' : 'mac')
run(process.execPath, [
  path.join(root, 'scripts/check-macos-package.mjs'),
  outputDirectory,
  macosDesktopTarget.minimumSystemVersion,
  values.arch,
])
