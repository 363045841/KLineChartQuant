/**
 * prefixed-output.mjs
 *
 * 为并行开发子进程的 stdout / stderr 逐行添加稳定、可区分的彩色来源前缀。
 */

import { ANSI, paint } from './lib/ansi.mjs'

const PREFIX_WIDTH = 13

/** 可用的 ANSI 前缀颜色。 */
export const LOG_COLORS = {
  vite: ANSI.magenta,
  gotdx: ANSI.green,
  binance: ANSI.yellow,
  baostock: ANSI.cyan,
  mt5: ANSI.blue,
}

/** 根据输出环境生成固定宽度前缀，非 TTY 或 NO_COLOR 环境自动禁用颜色。 */
function createPrefix(label, color, output) {
  return paint(`[${label}]`.padEnd(PREFIX_WIDTH), color, output)
}

/** 把可读流按换行或回车拆分，并将每一行写入带来源前缀的目标流。 */
function pipeLines(input, output, label, color) {
  if (!input) return

  const prefix = createPrefix(label, color, output)
  let pending = ''
  input.setEncoding('utf8')

  input.on('data', (chunk) => {
    pending += chunk
    const parts = pending.split(/\r\n|\r|\n/)
    pending = parts.pop() ?? ''
    for (const line of parts) output.write(`${prefix}${line}\n`)
  })

  input.on('end', () => {
    if (pending !== '') output.write(`${prefix}${pending}\n`)
    pending = ''
  })
}

/** 将子进程的 stdout / stderr 接入带前缀的父进程输出，并标记启动异常。 */
export function attachPrefixedOutput(child, label, color) {
  pipeLines(child.stdout, process.stdout, label, color)
  pipeLines(child.stderr, process.stderr, label, color)
  child.on('error', (error) => {
    const prefix = createPrefix(label, color, process.stderr)
    process.stderr.write(`${prefix}启动失败：${error.message}\n`)
  })
  return child
}
