/**
 * dev.mjs
 *
 * 启动 Vite 开发服务器，并可同时启动数据源后端（connector）。参数：
 *
 *   node scripts/dev.mjs                        # 仅开发服务器
 *   node scripts/dev.mjs -c all                 # 开发服务器 + 全部 connector
 *   node scripts/dev.mjs -c gotdx baostock      # 开发服务器 + 指定的 connector
 *   node scripts/dev.mjs -c mt5                 # MT5 本地终端后端（不在 all 内，需显式指定）
 *   node scripts/dev.mjs -c tdx                 # 支持别名（tdx / g / b / bnb / m / all）
 *   node scripts/dev.mjs --lan -c all           # 开发服务器绑定 0.0.0.0（局域网可访问）
 *
 * 对应 pnpm 简写命令：pnpm dev:all / pnpm dev:g / pnpm dev:b / pnpm dev:bnb / pnpm dev:mt5 / pnpm dev:lan:all。
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startConnectors } from './connectors.mjs'
import { manageShutdown } from './lib/managed-shutdown.mjs'
import { attachPrefixedOutput, LOG_COLORS } from './prefixed-output.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const lan = args.includes('--lan')

// 解析 `-c <names...>` 之后的 connector 名称
const cIndex = args.indexOf('-c')
const connNames = cIndex !== -1 ? args.slice(cIndex + 1).filter((a) => !a.startsWith('-')) : []

// 直接启动 Vite，避免嵌套的 pnpm 在 Ctrl+C 后追加 ELIFECYCLE 日志。
const vueRoot = path.join(ROOT, 'packages', 'vue')
const viteCli = path.join(vueRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const vite = attachPrefixedOutput(
  spawn(
    process.execPath,
    [viteCli, '--config', 'preview/vite.config.ts', ...(lan ? ['--host', '0.0.0.0'] : [])],
    {
      cwd: vueRoot,
      stdio: ['inherit', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  ),
  'vite',
  LOG_COLORS.vite,
)

const children = [vite, ...startConnectors(connNames)]

manageShutdown(children)

if (connNames.length === 0) {
  console.log('（未指定 -c，仅启动开发服务器。用 `pnpm dev -c all` 同时启动全部 connector。）')
}
