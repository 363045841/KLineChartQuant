/**
 * build-commit.mjs
 *
 * 读取构建机当前提交的短哈希与提交时间，供各 Vite 配置通过 define 注入产品构建元数据。
 * 取 HEAD 而不是远端 main：产物应当对应它实际编译的代码；CI 在 main 上构建时两者一致。
 */

import { execFileSync } from 'node:child_process'

/**
 * 返回构建提交的短哈希与提交时间。
 * 时间取提交自身的时区（%cI 的日期与时分），避免构建机与查看者时区不同导致含义漂移。
 * 非 git 工作树直接失败，避免产出无法追溯来源的构建。
 * @returns {{ hash: string, time: string }}
 */
export function resolveBuildCommit() {
  let output
  try {
    output = execFileSync('git', ['log', '-1', '--format=%h %cI', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch (cause) {
    throw new Error('[build-commit] 无法读取 git 提交信息，请在 git 工作树中构建。', { cause })
  }
  const [hash, committedAt] = output.split(' ')
  if (!hash || !committedAt) {
    throw new Error(`[build-commit] git 提交信息格式异常：${output}`)
  }
  return { hash, time: committedAt.slice(0, 16).replace('T', ' ') }
}
