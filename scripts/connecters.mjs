/**
 * connecters.mjs
 *
 * 数据源后端（connecter）的启动逻辑，供 `scripts/dev.mjs` 与 `scripts/start-connecter.mjs` 复用。
 * 支持名称与别名：gotdx（别名 tdx / g）、binance（别名 bnb）、baostock（别名 b）、full（全部）。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachPrefixedOutput, LOG_COLORS } from './prefixed-output.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const PARENT = path.resolve(__dirname, '..', '..')

// 各 connecter 的启动命令
const CONNECTERS = {
  gotdx: {
    label: 'gotdx（通达信，:8080）',
    logLabel: 'gotdx',
    logColor: LOG_COLORS.gotdx,
    dir: 'GoTDX-Connecter',
    cmd: 'go',
    args: ['run', '.', 'tdx'],
  },
  binance: {
    label: 'binance（币安深度，:8081）',
    logLabel: 'binance',
    logColor: LOG_COLORS.binance,
    dir: 'GoTDX-Connecter',
    cmd: 'go',
    args: ['run', '.', 'binance'],
  },
  baostock: {
    label: 'baostock / tradingview（:8000）',
    logLabel: 'baostock',
    logColor: LOG_COLORS.baostock,
    dir: 'Baostock-Tradingview-Connecter',
    cmd: 'uv',
    args: ['run', 'python', './server.py'],
  },
}

export const CONNECTER_NAMES = Object.keys(CONNECTERS)

// 名称 → 标准名；`full` / `all` 展开为全部
const ALIASES = {
  gotdx: 'gotdx',
  tdx: 'gotdx',
  g: 'gotdx',
  binance: 'binance',
  bnb: 'binance',
  baostock: 'baostock',
  b: 'baostock',
}

// 解析用户输入的名称列表，返回去重后的标准 connecter 名称数组
export function resolveConnecters(names) {
  const resolved = new Set()
  for (const raw of names) {
    const key = String(raw).toLowerCase().trim()
    if (key === 'full' || key === 'all') {
      for (const n of CONNECTER_NAMES) resolved.add(n)
      continue
    }
    const target = ALIASES[key]
    if (!target) {
      console.error(`  ✗ 未知 connecter：${raw}（可用：gotdx / binance / baostock / full）`)
      continue
    }
    resolved.add(target)
  }
  return [...resolved]
}

// 启动解析后的 connecter，返回子进程列表（已跳过未安装的目录）
export function startConnecters(names) {
  const children = []
  for (const name of resolveConnecters(names)) {
    const conn = CONNECTERS[name]
    const cwd = path.join(PARENT, conn.dir)
    if (!fs.existsSync(cwd)) {
      console.error(`  ✗ 未找到 ${conn.dir}，请先运行 pnpm setup 克隆数据源后端`)
      continue
    }
    console.log(`  • 启动 ${conn.label}（${cwd}）`)
    const child = spawn(conn.cmd, conn.args, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    children.push(attachPrefixedOutput(child, conn.logLabel, conn.logColor))
  }
  return children
}
