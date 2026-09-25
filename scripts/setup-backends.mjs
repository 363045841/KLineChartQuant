/**
 * setup-backends.mjs
 *
 * 一次性安装数据源后端：将 GoTDX-Connector（gotdx / binance）、Baostock-Tradingview-Connector
 * （baostock / tradingview）与 KCQ-MT5-connector（mt5）克隆到本仓库的同级目录，供
 * `pnpm dev -c <name>` / `pnpm connector <name>` 直接使用。
 * 幂等：目标目录已存在时跳过克隆，不会重复拉取。
 *
 * 用法：
 *   node scripts/setup-backends.mjs   # 或 pnpm setup:backends
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ANSI, paint } from './lib/ansi.mjs'
import { runWithDimmedOutput } from './lib/child-output.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PARENT = path.dirname(ROOT)

// 每个数据源后端：克隆到与本仓库同级，目录名与仓库名一致
const BACKENDS = [
  {
    name: 'GoTDX-Connector',
    repo: 'https://github.com/363045841/GoTDX-Connector.git',
    purpose: 'gotdx（通达信）行情后端，tdx-api 默认端口 8080，启动命令：`pnpm dev -c gotdx`',
  },
  {
    name: 'Baostock-Tradingview-Connector',
    repo: 'https://github.com/363045841/Baostock-Tradingview-Connector.git',
    purpose:
      'BaoStock（A 股）与 TradingView（全球品种）后端，FastAPI 默认端口 8000，启动命令：`pnpm connector baostock`',
  },
  {
    name: 'KCQ-MT5-connector',
    repo: 'https://github.com/EliteOtaku/KCQ-MT5-connector.git',
    purpose:
      'MT5 本地终端行情后端（Exness），FastAPI 默认端口 8090，启动命令：`pnpm connector mt5`（Windows + 已登录 MT5 (Exness) 终端）',
  },
]

// 完成后的启动命令与说明
const COMMANDS = [
  { command: 'pnpm dev -c all', comment: '# Vite 开发服务器 + 全部 connector（不含 mt5）' },
  { command: 'pnpm dev -c gotdx baostock', comment: '# 前端 + 指定的 connector' },
  { command: 'pnpm connector baostock', comment: '# 仅 BaoStock / TradingView 后端' },
  {
    command: 'pnpm connector mt5',
    comment: '# 仅 MT5 本地终端后端（Windows + 已登录 MT5 (Exness) 终端）',
  },
]

/** 克隆单个后端到同级目录；目录已存在时跳过。 */
function cloneOne({ name, repo }) {
  const target = path.join(PARENT, name)
  const label = paint(name, ANSI.bold)
  if (fs.existsSync(target)) {
    console.log(`  ${paint('✓', ANSI.softGreen)} ${label} ${paint('已存在，跳过克隆', ANSI.dim)}`)
    console.log(`    ${paint(target, ANSI.softGreen)}`)
    return
  }
  console.log(
    `  ${paint('•', ANSI.softGreen)} ${paint('克隆', ANSI.dim)} ${paint(repo, ANSI.softGreen)}`,
  )
  runWithDimmedOutput('git', ['clone', '--progress', repo, target])
  console.log(
    `  ${paint('✓', ANSI.softGreen)} ${label} ${paint('已克隆到', ANSI.dim)} ${paint(target, ANSI.softGreen)}`,
  )
}

/** 打印每个后端的用途说明：反引号包裹的命令名高亮，其余文字弱化。 */
function printPurpose(purpose) {
  const parts = purpose.split('`')
  const rendered = parts
    .map((part, index) => paint(part, index % 2 === 1 ? ANSI.softGreen : ANSI.dim))
    .join('')
  console.log(`    ${rendered}\n`)
}

console.log(`${paint('数据源后端将安装到同级目录：', ANSI.bold)}${paint(PARENT, ANSI.softGreen)}\n`)

for (const backend of BACKENDS) {
  cloneOne(backend)
  printPurpose(backend.purpose)
}

// 命令按最长的对齐，命令名高亮、注释弱化
const commandWidth = Math.max(...COMMANDS.map(({ command }) => command.length))
console.log(paint('完成。启动命令：', ANSI.bold))
for (const { command, comment } of COMMANDS) {
  console.log(
    `  ${paint(command.padEnd(commandWidth), ANSI.softGreen)}  ${paint(comment, ANSI.dim)}`,
  )
}

console.log(
  `\n${paint('要求本机已安装 git，以及 Go（>=1.21）与 uv/Python 3.12（后端首次运行时会自动下载依赖）。', ANSI.dim)}`,
)
