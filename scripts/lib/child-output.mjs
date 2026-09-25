/**
 * child-output.mjs
 *
 * 同步运行子进程，并把其输出逐行弱化、缩进后转印，形成从属层级。
 */

import { spawnSync } from 'node:child_process'
import { ANSI, paint, supportsColor } from './ansi.mjs'

// 从属输出的缩进
const OUTPUT_INDENT = '    '

/**
 * 逐行弱化并缩进文本；进度行在支持颜色的终端下以 \r 原地刷新，否则只保留最终状态。
 * @param {string} text 子进程输出
 * @param {NodeJS.WriteStream} output 目标输出流
 */
function writeDimmed(text, output) {
  const style = (line) => paint(`${OUTPUT_INDENT}${line}`, ANSI.dim, output)
  const inPlace = supportsColor(output)
  for (const rawLine of text.split(/\r?\n/)) {
    const segments = rawLine.split('\r').filter((segment) => segment !== '')
    if (segments.length === 0) continue
    if (inPlace) {
      for (const segment of segments) output.write(`\r${style(segment)}`)
    } else {
      output.write(style(segments[segments.length - 1]))
    }
    output.write('\n')
  }
}

/**
 * 同步运行子进程，并把 stdout / stderr 弱化缩进后转印。
 * @param {string} command 可执行文件
 * @param {string[]} args 参数列表
 * @throws {Error} 子进程启动失败或退出码非 0 时抛出
 */
export function runWithDimmedOutput(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.stdout) writeDimmed(result.stdout, process.stdout)
  if (result.stderr) writeDimmed(result.stderr, process.stderr)
  if (result.status !== 0) throw new Error(`${command} 退出码 ${result.status}`)
}
