/** 验证 vite CLI 解析：各包自带的 dev 脚本依赖它，路径解析错会让 dev 直接起不来。 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveViteCli } from '../vite-dev.mjs'

/** 走 scripts/vite-dev.mjs 启动 dev 的包目录，新增包时同步补充。 */
const PACKAGES_WITH_WRAPPED_DEV = ['vue', 'react']

test('从每个使用包装脚本的包目录都能解析到真实存在的 vite CLI', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  for (const name of PACKAGES_WITH_WRAPPED_DEV) {
    const cli = resolveViteCli(path.join(repoRoot, 'packages', name))
    assert.ok(cli.endsWith(path.join('bin', 'vite.js')), `非预期的 CLI 路径：${cli}`)
    assert.ok(existsSync(cli), `CLI 不存在：${cli}`)
  }
})
