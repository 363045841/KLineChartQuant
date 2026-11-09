/** 根组件直接挂载时必须同步初始化，防止顶层 await 让安装包启动后只显示背景。 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileScript, parse } from 'vue/compiler-sfc'

describe('desktop root startup', () => {
  it('compiles App.vue to synchronous setup for direct mounting', () => {
    const filename = new URL('../App.vue', import.meta.url)
    const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), {
      filename: filename.pathname,
    })
    expect(errors).toEqual([])

    // 条件分支中的顶层 await 也会使 setup 返回 Promise，正式模式不执行分支仍会黑屏。
    const compiled = compileScript(descriptor, { id: 'desktop-root' })
    expect(compiled.content).toMatch(/\bsetup\s*\(/)
    expect(compiled.content).not.toMatch(/\basync\s+setup\s*\(/)
  })
})
