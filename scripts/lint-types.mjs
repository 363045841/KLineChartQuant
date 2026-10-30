// 已发布包的类型解析门禁：统一 attw 口径并逐个校验。
// 用法：node scripts/lint-types.mjs [package ...]，不带参数时校验全部受检包。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// 受检包（目录名）→ 需要跳过的入口。CSS 入口不是 JS/类型，attw 必然报无法解析。
const PACKAGES = {
  vue: ['style.css'],
}

// 统一校验口径：只按 ESM 解析。这些包只发布 ESM，且 Node 22+ 已支持 require(ESM)，
// 再按旧 Node 的 CJS 规则校验只会产生误报。
const BASE_ARGS = ['--pack', '.', '--profile', 'esm-only']

// 每个包一次 attw 进程，进程内部单线程；串行跑等于把各包的 Node/TS 启动时间直接相加。
// 并发度固定 4：CI 是 4 vCPU，再高只是让各进程互相抢内存和磁盘。
const CONCURRENCY = 4

/**
 * 对单个包跑 attw，收集合并后的 stdout/stderr。
 * 不抛异常：spawn 失败与 attw 退出非零都落到 `ok: false`，由调用方统一汇总，
 * 避免一个包提前中断整轮校验。
 * @param name 受检包目录名，必须存在于 PACKAGES
 * @returns attw 是否通过，以及它在本次校验中产出的全部输出
 */
function runAttw(name) {
  const dir = join('packages', name)
  const excluded = PACKAGES[name]
  const args = [
    ...BASE_ARGS,
    ...(excluded.length > 0 ? ['--exclude-entrypoints', ...excluded] : []),
  ]

  return new Promise((resolve) => {
    const child = spawn('pnpm', ['exec', 'attw', ...args], { cwd: dir, shell: true })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', (error) => {
      resolve({ ok: false, output: `${output}${error.message}\n` })
    })
    child.on('close', (code) => {
      resolve({ ok: code === 0, output })
    })
  })
}

const selected = process.argv.slice(2)
const names = selected.length > 0 ? selected : Object.keys(PACKAGES)

const unknown = names.filter((name) => !(name in PACKAGES))
if (unknown.length > 0) {
  console.error(`unknown package: ${unknown.join(', ')}`)
  process.exit(1)
}

const failed = []
const targets = []
for (const name of names) {
  const dir = join('packages', name)
  if (!existsSync(dir)) {
    console.error(`${name}: ${dir} does not exist`)
    failed.push(name)
    continue
  }
  targets.push(name)
}

// 固定大小的并发池；每个包只写自己那份结果，互不共享状态。
const results = new Map()
const queue = targets.slice()
async function worker() {
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    results.set(name, await runAttw(name))
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))

// 按包列表顺序打印而不是完成顺序：门禁日志要能跟上一轮逐段比对。
for (const name of targets) {
  const { ok, output } = results.get(name)
  console.log(`\n=== ${name} ===\n${output.trimEnd()}`)
  if (!ok) failed.push(name)
}

if (failed.length > 0) {
  console.error(`\ntype resolution failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('\ntype resolution passed for all checked packages')
