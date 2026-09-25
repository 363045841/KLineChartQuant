// 开发命令的统一退出控制：结束进程树并等待输出管道关闭。

import { killProcessTree } from './kill-process-tree.mjs'

// close 表示进程退出且标准输出/错误管道均已关闭；error 也可能没有 close。
function waitForClose(child) {
  return new Promise((resolve) => {
    child.once('close', resolve)
    child.once('error', () => {
      if (child.pid === undefined) resolve()
    })
  })
}

// 两个入口共享同一套信号监听，避免重复清理及强制退出时漏掉管道输出。
export function manageShutdown(children) {
  const closed = children.map(waitForClose)
  let shuttingDown = false

  function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true
    // Windows 控制台会把 Ctrl+C 广播给 Go 服务，给它时间完成自己的 Shutdown。
    // 其他情形由父进程主动结束进程树。
    if (process.platform !== 'win32' || signal !== 'SIGINT') {
      for (const child of children) killProcessTree(child)
    }
    const force = setTimeout(() => {
      for (const child of children) killProcessTree(child)
    }, 12000)
    // go run 可能先退出而服务进程仍持有管道；限制整个等待时间。
    const timeout = setTimeout(() => {
      process.exitCode = 1
      process.exit()
    }, 15000)
    Promise.all(closed).then(() => {
      clearTimeout(force)
      clearTimeout(timeout)
      process.exitCode = 0
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}
