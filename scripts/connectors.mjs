/**
 * connectors.mjs
 *
 * 数据源后端（connector）的启动逻辑，供 `scripts/dev.mjs` 与 `scripts/start-connector.mjs` 复用。
 * 支持名称与别名：gotdx（别名 tdx / g）、binance（别名 bnb）、baostock（别名 b）、mt5（别名 m）、all（全部）。
 * `all` 不含 mt5：它依赖 Windows + 已登录的 MT5 (Exness) 终端，仅显式启动。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachPrefixedOutput, LOG_COLORS } from './prefixed-output.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const PARENT = path.resolve(__dirname, '..', '..')

// 各 connector 的启动命令
const CONNECTORS = {
  gotdx: {
    label: 'gotdx（通达信，:8080）',
    logLabel: 'gotdx',
    logColor: LOG_COLORS.gotdx,
    dir: 'GoTDX-Connector',
    cmd: 'go',
    args: ['run', './services/tdx-api'],
  },
  binance: {
    label: 'binance（币安深度，:8081）',
    logLabel: 'binance',
    logColor: LOG_COLORS.binance,
    dir: 'GoTDX-Connector',
    cmd: 'go',
    args: ['run', './services/binance-api'],
  },
  baostock: {
    label: 'baostock / tradingview（:8000）',
    logLabel: 'baostock',
    logColor: LOG_COLORS.baostock,
    dir: 'Baostock-Tradingview-Connector',
    cmd: 'uv',
    args: ['run', 'python', './server.py'],
  },
  mt5: {
    label: 'mt5（本地终端，:8090）',
    logLabel: 'mt5',
    logColor: LOG_COLORS.mt5,
    dir: 'KCQ-MT5-connector',
    cmd: 'uv',
    args: ['run', 'python', './server.py'],
    // 依赖 Windows + 本机已登录的 MT5 (Exness) 终端，不纳入 `all`，仅显式启动
    includeInAll: false,
  },
}

export const CONNECTOR_NAMES = Object.keys(CONNECTORS)

// `all` 展开的集合：跳过 includeInAll === false 的 connector（如 mt5）
const ALL_CONNECTOR_NAMES = CONNECTOR_NAMES.filter(
  (name) => CONNECTORS[name].includeInAll !== false,
)

// 名称 → 标准名；`all` 展开为全部
const ALIASES = {
  gotdx: 'gotdx',
  tdx: 'gotdx',
  g: 'gotdx',
  binance: 'binance',
  bnb: 'binance',
  baostock: 'baostock',
  b: 'baostock',
  mt5: 'mt5',
  m: 'mt5',
}

// 解析用户输入的名称列表，返回去重后的标准 connector 名称数组
export function resolveConnectors(names) {
  const resolved = new Set()
  for (const raw of names) {
    const key = String(raw).toLowerCase().trim()
    if (key === 'all') {
      for (const n of ALL_CONNECTOR_NAMES) resolved.add(n)
      continue
    }
    const target = ALIASES[key]
    if (!target) {
      console.error(`  ✗ 未知 connector：${raw}（可用：gotdx / binance / baostock / mt5 / all）`)
      continue
    }
    resolved.add(target)
  }
  return [...resolved]
}

// 启动解析后的 connector，返回子进程列表（已跳过未安装的目录）
export function startConnectors(names) {
  const children = []
  for (const name of resolveConnectors(names)) {
    const conn = CONNECTORS[name]
    const cwd = path.join(PARENT, conn.dir)
    if (!fs.existsSync(cwd)) {
      console.error(`  ✗ 未找到 ${conn.dir}，请先运行 pnpm setup:backends 克隆数据源后端`)
      continue
    }
    console.log(`  • 启动 ${conn.label}（${cwd}）`)
    const child = spawn(conn.cmd, conn.args, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    children.push(attachPrefixedOutput(child, conn.logLabel, conn.logColor))
  }
  return children
}
