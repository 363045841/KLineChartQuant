/** 副本身份改写只动指标与库声明，保留注释、其他同名属性与计算代码。 */
import { describe, expect, it } from 'vitest'
import { rewriteScriptIdentity } from '../rewriteScriptIdentity.js'

const source = `// 顶部注释
defineIndicator({
  name: 'Average',
  inputs: { period: input.int(20) },
  onBar() {
    // 计算代码里的同名属性不属于指标身份
    const options = { name: 'keep-me' }
    plot.Line(close, 'average')
  },
})`

describe('rewriteScriptIdentity', () => {
  it('改写 name，注释、计算代码与其他同名属性保持原样', async () => {
    const copy = await rewriteScriptIdentity(source, 'Average 副本')
    expect(copy).toContain('name: "Average 副本"')
    expect(copy).toContain("name: 'keep-me'")
    expect(copy).toContain('// 顶部注释')
    expect(copy).toContain('// 计算代码里的同名属性不属于指标身份')
    expect(copy).not.toContain('displayName')
  })

  it('库声明的首个名称参数同步改写', async () => {
    const copy = await rewriteScriptIdentity("defineLibrary('TA', { sma() {} })", 'TA 副本')
    expect(copy).toContain('defineLibrary("TA 副本"')
  })

  it('声明不是对象或缺少 name 时明确失败', async () => {
    await expect(rewriteScriptIdentity('defineIndicator(42)', 'X')).rejects.toThrow('必须是对象')
    await expect(rewriteScriptIdentity('const value = 1', 'X')).rejects.toThrow(
      '未找到脚本名称声明',
    )
  })
})
