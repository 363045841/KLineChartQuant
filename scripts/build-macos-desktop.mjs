/** 在 Mac 上按兼容档位和 CPU 架构编译后端、前端并生成 DMG。 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { resolveMacosBuildProfile } from './macos-build-profiles.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const desktop = path.join(root, 'packages/desktop-electron')
const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'standard' },
    arch: { type: 'string', default: process.arch },
  },
})
const profile = resolveMacosBuildProfile(values.profile)
if (process.platform !== 'darwin') throw new Error('build:mac 需要在 macOS 上运行')
if (!['x64', 'arm64'].includes(values.arch)) throw new Error('Mac 架构只能是 x64 或 arm64')

// 禁止 Go 按依赖的 go.mod 自动升级工具链，否则兼容包可能悄悄变为要求 macOS 13。
const env = { ...process.env, GOTOOLCHAIN: 'local', KCQ_DESKTOP_PROFILE: values.profile }
const goVersion = execFileSync('go', ['env', 'GOVERSION'], { env, encoding: 'utf8' }).trim()
if (goVersion !== `go${profile.goVersion}`) {
  throw new Error(`${values.profile} 需要 Go ${profile.goVersion}，当前为 ${goVersion}`)
}

/** 在桌面包目录执行构建命令，保留完整输出并传播失败。 */
function run(command, args) {
  execFileSync(command, args, { cwd: desktop, env, stdio: 'inherit' })
}

// 本目录仅存放生成的二进制；切换档位时清掉上一次构建，避免混入其他系统要求的后端。
rmSync(path.join(desktop, 'resources/backends'), { recursive: true, force: true })
const backendArgs = [
  path.join(root, 'scripts/build-backends.mjs'),
  '--target',
  `darwin-${values.arch}`,
]
if (profile.backendOverrides)
  backendArgs.push('--overrides', path.join(root, profile.backendOverrides))
run(process.execPath, backendArgs)
run('pnpm', ['exec', 'electron-vite', 'build'])

// 使用 JSON 保留 "12.0" / "13.0" 字符串；CLI 点号参数会把它们解析成数值。
const configDirectory = path.join(root, 'node_modules/.tmp/desktop-macos')
mkdirSync(configDirectory, { recursive: true })
const configFile = path.join(configDirectory, `${values.profile}-${values.arch}.json`)
writeFileSync(
  configFile,
  JSON.stringify({
    extends: path.join(desktop, 'electron-builder.yml'),
    mac: {
      minimumSystemVersion: profile.minimumSystemVersion,
      artifactName: `\${productName}-\${version}-${profile.label}-\${arch}.\${ext}`,
    },
    ...(profile.electronVersion ? { electronVersion: profile.electronVersion } : {}),
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

const appDirectory = values.arch === 'arm64' ? 'mac-arm64' : 'mac'
run(process.execPath, [
  path.join(root, 'scripts/check-macos-package.mjs'),
  path.join(desktop, 'dist', appDirectory, 'KLineChart Quant.app'),
  values.profile,
  values.arch,
])
