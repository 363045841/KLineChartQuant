/**
 * kill-process-tree.mjs
 *
 * 结束子进程及其全部后代进程。
 * 开发脚本启动的 connector 通常是 uv / go run / shell 包一层再拉起真正的服务，
 * 只 kill 直接子进程会留下孤儿进程继续占用端口，因此必须按进程树结束。
 */

import { spawnSync } from 'node:child_process'

/**
 * 结束子进程及其全部后代。
 * Windows 用 `taskkill /T` 结束整棵树；其余平台优先结束进程组，不支持时回退到直接 kill。
 *
 * @param {import('node:child_process').ChildProcess} child - 待结束的子进程
 */
export function killProcessTree(child) {
  if (!child || child.pid === undefined) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill()
  }
}
