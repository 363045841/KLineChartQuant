/**
 * start-connecter.mjs
 *
 * 仅启动数据源后端（connecter），不启动前端。参数可选，选择启动哪个 connecter：
 *
 *   node scripts/start-connecter.mjs            # 启动全部 connecter（gotdx + binance + baostock，不含 mt5）
 *   node scripts/start-connecter.mjs gotdx      # gotdx 通达信（:8080）
 *   node scripts/start-connecter.mjs binance    # 币安深度（:8081）
 *   node scripts/start-connecter.mjs baostock   # BaoStock / TradingView（:8000）
 *   node scripts/start-connecter.mjs mt5        # MT5 本地终端（:8090，Windows + 已登录 MT5 终端）
 *   node scripts/start-connecter.mjs tdx baostock  # 可同时指定多个，也支持别名
 *
 * 需要连同前端一起启动时，使用 `pnpm dev -c <names>`。
 */

import { startConnecters } from './connecters.mjs'

// 无参时启动 `all`（不含依赖本机 MT5 终端的 mt5）
const names = process.argv.slice(2)
const children = startConnecters(names.length > 0 ? names : ['all'])

if (children.length === 0) {
  console.error('\n没有可启动的 connecter。先运行 pnpm setup 克隆数据源后端，再重试。')
  process.exitCode = 1
} else {
  console.log(`\n已启动 ${children.length} 个 connecter（按 Ctrl+C 结束）。`)
}

function shutdown() {
  for (const child of children) {
    if (child && !child.killed) child.kill()
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
