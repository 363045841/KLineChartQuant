/**
 * 把随桌面端分发的两个 Go connector 编译到
 * `packages/desktop-electron/resources/backends/<platform>-<arch>/`，供 electron-builder
 * 经 `extraResources` 打进安装包。版本由 `packages/desktop-electron/backends.json` 固定，
 * 源码克隆到 `node_modules/.tmp/backends`，重复执行只会切到指定 commit。
 *
 * 用法：
 *   node scripts/build-backends.mjs                      # 当前平台（macOS 同时出 x64 / arm64）
 *   node scripts/build-backends.mjs --target win32-x64   # 指定目标，可逗号分隔多个
 *   node scripts/build-backends.mjs --source gotdx=../GoTDX-Connector
 *   node scripts/build-backends.mjs --overrides packages/desktop-electron/backends-macos12.json
 *
 * 要求：本机已安装 Go（版本需满足各仓库 go.mod 的声明）。
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DESKTOP = path.join(ROOT, 'packages/desktop-electron')
const MANIFEST = path.join(DESKTOP, 'backends.json')
const SOURCE_CACHE = path.join(ROOT, 'node_modules/.tmp/backends')
const OUTPUT_ROOT = path.join(DESKTOP, 'resources/backends')

// Go 的 GOOS/GOARCH 与 Electron 的平台/架构命名不同，集中映射一次
const GO_OS = { win32: 'windows', darwin: 'darwin', linux: 'linux' }
const GO_ARCH = { x64: 'amd64', arm64: 'arm64' }

/** 默认目标：macOS 需要同时出两种架构，其余平台出当前架构。 */
function defaultTargets() {
  if (process.platform === 'darwin') return ['darwin-arm64', 'darwin-x64']
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return [`${process.platform}-${arch}`]
}

/** 解析 `--target a,b`；缺省时按当前平台推断。 */
function resolveTargets(argv) {
  const index = argv.indexOf('--target')
  if (index === -1) return defaultTargets()
  return String(argv[index + 1] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 解析 `--source <id>=<path>`：复用已有的仓库副本，跳过克隆与 commit 校验。
 * 只用于离线构建或本地调试版本改动；正常打包走清单里固定的 commit。
 */
function resolveSources(argv) {
  const sources = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--source') continue
    const [id, directory] = String(argv[index + 1] ?? '').split('=')
    if (!id || !directory) throw new Error('--source 需要形如 gotdx=../GoTDX-Connector')
    const resolved = path.resolve(ROOT, directory)
    if (!fs.existsSync(path.join(resolved, 'go.mod')))
      throw new Error(`--source ${id} 指向的目录不是 Go 仓库：${resolved}`)
    sources.set(id, resolved)
  }
  return sources
}

/** 按需加载档位覆盖，仅替换指定后端的仓库与固定提交。 */
function resolveBackends(manifest, argv) {
  const index = argv.indexOf('--overrides')
  if (index === -1) return manifest.backends
  if (!argv[index + 1]) throw new Error('--overrides 需要配置文件路径')
  const { overrides } = JSON.parse(fs.readFileSync(path.resolve(ROOT, argv[index + 1]), 'utf8'))
  for (const id of Object.keys(overrides)) {
    if (!manifest.backends.some((backend) => backend.id === id))
      throw new Error(`未知后端覆盖：${id}`)
  }
  return manifest.backends.map((backend) => {
    if (!Object.hasOwn(overrides, backend.id)) return backend
    const { repo, commit } = overrides[backend.id]
    return { ...backend, repo, commit }
  })
}

/** 执行命令并把输出交给用户；失败直接终止构建。 */
function run(command, args, options = {}) {
  try {
    execFileSync(command, args, { stdio: 'inherit', ...options })
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`未找到 ${command}，请先安装（Go：https://go.dev/dl/）`)
    }
    throw error
  }
}

/** 读取命令输出，用于判断当前 checkout 是否已经是目标 commit。 */
function capture(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/** 确保源码副本停在清单固定 commit 上；已就位时不做任何网络操作。 */
function ensureSource(backend, override) {
  if (override) return override
  const directory = path.join(SOURCE_CACHE, backend.id)
  // `--no-checkout` 只取对象不落工作区，所以「HEAD 已经是目标 commit」并不等于文件已就绪；
  // 新克隆的仓库必须再走一次 checkout，否则 go build 会看到空目录。
  const cloned = !fs.existsSync(path.join(directory, '.git'))
  if (cloned) {
    fs.mkdirSync(SOURCE_CACHE, { recursive: true })
    console.log(`  • 克隆 ${backend.repo}`)
    try {
      run('git', ['clone', '--filter=blob:none', '--no-checkout', backend.repo, directory])
    } catch (error) {
      throw new Error(
        `克隆 ${backend.repo} 失败；离线环境请用 --source ${backend.id}=<本地仓库路径> 复用已有副本。`,
        { cause: error },
      )
    }
  }
  let head = ''
  try {
    head = capture('git', ['-C', directory, 'rev-parse', 'HEAD']).trim()
  } catch {
    head = ''
  }
  if (!cloned && head === backend.commit) return directory

  console.log(`  • ${backend.id} 切到 ${backend.commit.slice(0, 12)}`)
  if (head !== backend.commit) {
    // 不同档位可从不同仓库固定提交；缓存副本的 origin 不一定是本次的源仓库。
    run('git', ['-C', directory, 'fetch', '--depth', '1', backend.repo, backend.commit])
  }
  run('git', [
    '-C',
    directory,
    '-c',
    'advice.detachedHead=false',
    'checkout',
    '--detach',
    backend.commit,
  ])
  if (!fs.existsSync(path.join(directory, backend.package)))
    throw new Error(
      `${backend.id} 的 checkout 缺少 ${backend.package}，检查 backends.json 的 package 字段`,
    )
  return directory
}

/** 编译单个后端的单个目标，返回产物路径。 */
function build(backend, target, sourceDirectory) {
  const [platform, arch] = target.split('-')
  const goos = GO_OS[platform]
  const goarch = GO_ARCH[arch]
  if (!goos || !goarch)
    throw new Error(`不支持的目标：${target}（可用 win32-x64 / darwin-arm64 / linux-x64 等）`)

  const outputDirectory = path.join(OUTPUT_ROOT, target)
  fs.mkdirSync(outputDirectory, { recursive: true })
  const output = path.join(
    outputDirectory,
    platform === 'win32' ? `${backend.binary}.exe` : backend.binary,
  )
  run('go', ['build', '-trimpath', '-ldflags', '-s -w', '-o', output, backend.package], {
    cwd: sourceDirectory,
    env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: '0' },
  })
  return output
}

const argv = process.argv.slice(2)
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const targets = resolveTargets(argv)
const sources = resolveSources(argv)
if (!targets.length) throw new Error('没有可构建的目标')

console.log(`Go connector 目标：${targets.join(', ')}`)
for (const backend of resolveBackends(manifest, argv)) {
  const sourceDirectory = ensureSource(backend, sources.get(backend.id))
  for (const target of targets) {
    const output = build(backend, target, sourceDirectory)
    const size = (fs.statSync(output).size / 1024 / 1024).toFixed(1)
    console.log(`  ✓ ${path.relative(ROOT, output)}  ${size} MB`)
  }
}
