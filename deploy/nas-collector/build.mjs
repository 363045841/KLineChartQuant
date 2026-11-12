#!/usr/bin/env node
/**
 * KCQ NAS 采集器构建脚本。
 *
 * 职责：把 `packages/analytics/src/cli.ts` 及其全部本地模块打成单文件 ESM
 * `dist/collector.mjs`，供群晖 NAS 上的 Node ≥ 20 直接运行。
 *
 * 依赖：仓库已有的 esbuild（pnpm store 中由依赖树带入的版本），不新增 npm 依赖。
 * 本仓只允许 pnpm，而 `npx` 属于 npm 工具链，所以这里不用 npx：直接解析本地
 * esbuild 包，调用它的 JS API 构建，行为与命令行等价且不依赖 PATH。
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 脚本所在目录：deploy/nas-collector。 */
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

/** 仓库根目录。 */
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..')

/** 构建入口：采集器 CLI 源码。 */
const ENTRY_POINT = join(REPO_ROOT, 'packages', 'analytics', 'src', 'cli.ts')

/** 构建产物：单文件 ESM。 */
const OUTPUT_FILE = join(SCRIPT_DIR, 'dist', 'collector.mjs')

/**
 * 把版本串拆成可比较的数字段。
 *
 * @param version 形如 `0.28.2` 的版本串
 * @returns 数字段数组；非数字段按 0 处理
 */
function toVersionParts(version) {
  return version.split('.').map((part) => {
    const value = Number.parseInt(part, 10)
    return Number.isFinite(value) ? value : 0
  })
}

/**
 * 比较两个版本号。
 *
 * @param left 左版本
 * @param right 右版本
 * @returns 负数表示 left 更小，正数表示更大
 */
function compareVersion(left, right) {
  const leftParts = toVersionParts(left)
  const rightParts = toVersionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) {
      return difference
    }
  }
  return 0
}

/**
 * 找到仓库内可用的 esbuild 包目录。
 *
 * 查找顺序：
 * 1. 根 package.json 直接声明 esbuild 时按 Node 解析规则取（当前没有，留给将来）；
 * 2. pnpm 虚拟 store `node_modules/.pnpm/esbuild@<ver>/node_modules/esbuild`，取最高版本。
 *
 * @returns esbuild 包目录绝对路径
 * @throws Error 仓库内找不到 esbuild
 */
function resolveEsbuildPackage() {
  const requireFromRoot = createRequire(join(REPO_ROOT, 'package.json'))
  try {
    return dirname(requireFromRoot.resolve('esbuild/package.json'))
  } catch {
    // 预期分支：esbuild 不是根依赖，继续找 pnpm store。
  }

  const storeDir = join(REPO_ROOT, 'node_modules', '.pnpm')
  if (existsSync(storeDir)) {
    const best = readdirSync(storeDir)
      .filter((name) => name.startsWith('esbuild@'))
      .map((name) => ({ name, version: name.slice('esbuild@'.length).split('_')[0] }))
      .filter((entry) =>
        existsSync(join(storeDir, entry.name, 'node_modules', 'esbuild', 'package.json')),
      )
      .sort((left, right) => compareVersion(left.version, right.version))
      .pop()
    if (best !== undefined) {
      return join(storeDir, best.name, 'node_modules', 'esbuild')
    }
  }

  throw new Error(
    '仓库内找不到 esbuild。请先在仓库根目录执行 pnpm install（esbuild 由现有依赖树带入）。',
  )
}

/**
 * 构建入口。
 *
 * @throws Error 源码缺失、esbuild 不可用或构建失败
 */
async function main() {
  if (!existsSync(ENTRY_POINT)) {
    throw new Error(`采集器源码不存在：${ENTRY_POINT}`)
  }

  const esbuildPackageDir = resolveEsbuildPackage()
  const esbuildModule = await import(pathToFileURL(join(esbuildPackageDir, 'lib', 'main.js')).href)
  const build = esbuildModule.build ?? esbuildModule.default?.build
  if (typeof build !== 'function') {
    throw new Error(`esbuild 模块结构异常，未找到 build 函数：${esbuildPackageDir}`)
  }

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true })
  const startedAt = Date.now()

  await build({
    absWorkingDir: REPO_ROOT,
    entryPoints: [ENTRY_POINT],
    outfile: OUTPUT_FILE,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // 只把 Node 内置模块留作外部依赖；采集器没有第三方运行时依赖，其余源码全部内联。
    external: ['node:*'],
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'info',
  })

  const bytes = statSync(OUTPUT_FILE).size
  try {
    // NAS 上可直接 ./collector.mjs 运行；Windows 无执行位，失败可忽略。
    chmodSync(OUTPUT_FILE, 0o755)
  } catch {
    // 忽略：执行位只在 POSIX 平台有意义。
  }

  const outputPath = relative(REPO_ROOT, OUTPUT_FILE).split('\\').join('/')
  console.log(`构建完成：${outputPath}`)
  console.log(`产物大小：${(bytes / 1024).toFixed(1)} KiB（${bytes} 字节）`)
  console.log(`运行目标：Node ≥ 20 / ESM / 单文件，耗时 ${Date.now() - startedAt}ms`)
}

main().catch((error) => {
  console.error(`[构建失败] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
