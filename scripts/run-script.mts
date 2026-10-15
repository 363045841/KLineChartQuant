/**
 * 本地运行一个脚本文件，用确定性示例行情验证脚本输出。
 *
 * 用法：pnpm script:run <脚本文件> [--period 3]
 * 目前使用内置示例行情；后续可替换为本地行情后端。
 */
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { runQuickJSScript } from '../packages/script/src/index.ts'

/** 生成一段确定性的示例 K 线：小幅波动便于肉眼校验。 */
function sampleBars(count: number) {
  const bars = []
  let close = 100
  for (let index = 0; index < count; index++) {
    close += ((index % 5) - 2) * 2
    bars.push({ time: index * 60_000, open: close, high: close, low: close, close, volume: 1 })
  }
  return bars
}

const args = process.argv.slice(2)
const file = args.find((arg) => !arg.startsWith('-'))
if (!file) throw new Error('用法：pnpm script:run <脚本文件> [--period N]')
const periodIndex = args.indexOf('--period')
const period = periodIndex === -1 ? 3 : Number(args[periodIndex + 1])

const source = await readFile(resolve(file), 'utf8')
const collection = await runQuickJSScript({
  source,
  bars: sampleBars(12),
  params: { period },
})

process.stdout.write(`# ${basename(file)}  period=${period}\n`)
for (const plot of collection.plots) {
  const values = plot.data.map((point) => (point === undefined ? '.' : point.value.toFixed(2)))
  process.stdout.write(`${plot.id}: ${values.join('  ')}\n`)
}
