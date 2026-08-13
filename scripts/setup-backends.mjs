/**
 * setup-backends.mjs
 *
 * 一次性安装数据源后端：将 GoTDX-Connecter（gotdx）与 Baostock-Tradingview-Connecter
 * （baostock / tradingview）克隆到本仓库的同级目录，供 `pnpm dev -c full` / `pnpm connecter` 直接使用。
 * 幂等：目标目录已存在时跳过克隆，不会重复拉取。
 *
 * 用法：
 *   node scripts/setup-backends.mjs   # 或 pnpm setup
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PARENT = path.dirname(ROOT)

// 每个数据源后端：克隆到与本仓库同级，目录名与仓库名一致
const BACKENDS = [
  {
    name: 'GoTDX-Connecter',
    repo: 'https://github.com/363045841/GoTDX-Connecter.git',
    purpose: 'gotdx（通达信）行情后端，tdx-api 默认端口 8080，`pnpm dev -c gotdx` 需要',
  },
  {
    name: 'Baostock-Tradingview-Connecter',
    repo: 'https://github.com/363045841/Baostock-Tradingview-Connecter.git',
    purpose: 'BaoStock（A 股）与 TradingView（全球品种）后端，FastAPI 默认端口 8000',
  },
]

function cloneOne({ name, repo }) {
  const target = path.join(PARENT, name)
  if (fs.existsSync(target)) {
    console.log(`  ✓ ${name} 已存在，跳过克隆（${target}）`)
    return
  }
  console.log(`  • 克隆 ${repo}`)
  execFileSync('git', ['clone', repo, target], { stdio: 'inherit' })
  if (!fs.existsSync(target)) {
    throw new Error(`克隆失败：未生成目录 ${target}`)
  }
  console.log(`  ✓ ${name} 已克隆到 ${target}`)
}

console.log(`数据源后端将安装到同级目录：${PARENT}\n`)

for (const backend of BACKENDS) {
  cloneOne(backend)
  console.log(`    - ${backend.purpose}\n`)
}

console.log('完成。启动命令：')
console.log('  pnpm dev -c full              # Vite 开发服务器 + 全部 connecter')
console.log('  pnpm dev -c gotdx baostock    # 前端 + 指定的 connecter')
console.log('  pnpm connecter baostock       # 仅 BaoStock / TradingView 后端')
console.log('\n要求本机已安装 git，以及 Go（>=1.21）与 uv/Python 3.12（后端首次运行时会自动下载依赖）。')