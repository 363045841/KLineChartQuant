/**
 * vite-dev.mjs
 *
 * 以受限的 Rolldown 线程池启动 Vite，使各包自带的 dev 脚本与 scripts/dev.mjs 行为一致。
 * 用法：node ../../scripts/vite-dev.mjs --config preview/vite.config.ts
 *
 * 线程池限制的原因、实测数据与上游引用见 lib/rolldown-thread-env.mjs。
 * 退出控制复用 lib/managed-shutdown.mjs，与 dev.mjs 保持同一套语义。
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { manageShutdown } from './lib/managed-shutdown.mjs'
import { withRolldownThreadLimit } from './lib/rolldown-thread-env.mjs'

/**
 * 从包目录解析 vite CLI 的绝对路径，避免手写 node_modules 相对路径。
 * @param {string} cwd 包目录，其依赖中需能解析到 vite
 * @returns {string} vite CLI 脚本的绝对路径
 */
export function resolveViteCli(cwd) {
  const require = createRequire(path.join(cwd, 'package.json'))
  return path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js')
}

/** 以受限线程池启动 vite，并透传其余命令行参数。 */
function start() {
  const vite = spawn(process.execPath, [resolveViteCli(process.cwd()), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: withRolldownThreadLimit(),
  })
  manageShutdown([vite])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start()
}
