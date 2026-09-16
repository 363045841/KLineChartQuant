// 已发布包的类型解析门禁：统一 attw 口径并逐个校验。
// 用法：node scripts/lint-types.mjs [package ...]，不带参数时校验全部受检包。
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// 受检包（目录名）→ 需要跳过的入口。CSS 入口不是 JS/类型，attw 必然报无法解析。
const PACKAGES = {
  core: [],
  'agent-runtime': [],
  vue: ['style.css'],
  react: [],
  angular: [],
}

// 统一校验口径：只按 ESM 解析。这些包只发布 ESM，且 Node 22+ 已支持 require(ESM)，
// 再按旧 Node 的 CJS 规则校验只会产生误报。
const BASE_ARGS = ['--pack', '.', '--profile', 'esm-only']

const selected = process.argv.slice(2)
const names = selected.length > 0 ? selected : Object.keys(PACKAGES)

const unknown = names.filter((name) => !(name in PACKAGES))
if (unknown.length > 0) {
  console.error(`unknown package: ${unknown.join(', ')}`)
  process.exit(1)
}

const failed = []

for (const name of names) {
  const dir = join('packages', name)
  if (!existsSync(dir)) {
    console.error(`${name}: ${dir} does not exist`)
    failed.push(name)
    continue
  }

  const excluded = PACKAGES[name]
  const args = [
    ...BASE_ARGS,
    ...(excluded.length > 0 ? ['--exclude-entrypoints', ...excluded] : []),
  ]

  console.log(`\n=== ${name} ===`)
  try {
    execFileSync('pnpm', ['exec', 'attw', ...args], { cwd: dir, stdio: 'inherit', shell: true })
  } catch {
    failed.push(name)
  }
}

if (failed.length > 0) {
  console.error(`\ntype resolution failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('\ntype resolution passed for all checked packages')
