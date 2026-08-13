/**
 * dev.mjs
 *
 * 启动 Vite 开发服务器，并可同时启动数据源后端（connecter）。参数：
 *
 *   node scripts/dev.mjs                        # 仅开发服务器
 *   node scripts/dev.mjs -c all                 # 开发服务器 + 全部 connecter
 *   node scripts/dev.mjs -c gotdx baostock      # 开发服务器 + 指定的 connecter
 *   node scripts/dev.mjs -c tdx                 # 支持别名（tdx / g / b / bnb / all）
 *   node scripts/dev.mjs --lan -c all           # 开发服务器绑定 0.0.0.0（局域网可访问）
 *
 * 对应 pnpm 简写命令：pnpm dev:all / pnpm dev:g / pnpm dev:b / pnpm dev:bnb / pnpm dev:lan:all。
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startConnecters } from './connecters.mjs'
import { attachPrefixedOutput, LOG_COLORS } from './prefixed-output.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const args = process.argv.slice(2)
const lan = args.includes('--lan')

// 解析 `-c <names...>` 之后的 connecter 名称
const cIndex = args.indexOf('-c')
const connNames = cIndex !== -1 ? args.slice(cIndex + 1).filter((a) => !a.startsWith('-')) : []

// 启动 Vite 开发服务器（vue 包的 preview 配置已绑定 0.0.0.0，--lan 仅透传 --host）
const viteCommand = `pnpm --filter @363045841yyt/klinechart dev${lan ? ' --host 0.0.0.0' : ''}`
const vite = attachPrefixedOutput(
  spawn(viteCommand, {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  }),
  'vite',
  LOG_COLORS.vite,
)

const children = [vite, ...startConnecters(connNames)]

// 收到退出信号时一并结束所有子进程
function shutdown() {
  for (const child of children) {
    if (child && !child.killed) child.kill()
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

if (connNames.length === 0) {
  console.log('（未指定 -c，仅启动开发服务器。用 `pnpm dev -c all` 同时启动全部 connecter。）')
}
