/**
 * 基准数据流水线：跑完整矩阵后生成全部图表。
 *
 * 用法：
 *   pnpm bench:report                 # 单轮全矩阵 + 异常点自动补测 + 全部图
 *   pnpm bench:report --charts-only   # 只重画已有 CSV
 *   pnpm bench:report --bars=1200     # 额外参数原样转给 run.mjs
 *
 * 单点重跑仍直接用 `node bench/run.mjs --bars=...`；结果按场景合并，不会清空其他点。
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const passed = process.argv.slice(2)
const chartsOnly = passed.includes('--charts-only')
const extra = passed.filter((value) => value !== '--charts-only')

/** 前台执行子进程；失败立即退出，避免带着半套数据继续出图。 */
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const totalSteps = chartsOnly ? 3 : 4
let step = 0

/** 标注当前阶段，出图和 uv 启动的几秒也不会看起来没有响应。 */
function stage(name) {
  step += 1
  process.stderr.write(`[report] ${step}/${totalSteps} ${name}\n`)
}

if (!chartsOnly) {
  stage('render benchmark')
  run(process.execPath, [join('bench', 'run.mjs'), ...extra])
}

stage('diagnostic charts')
run('uv', ['run', join('bench', 'plot.py')])
stage('promo chart')
run('uv', ['run', join('bench', 'promo.py')])
stage('promo chart (ichimoku)')
run('uv', ['run', join('bench', 'promo.py'), '--profile=ichimoku'])
