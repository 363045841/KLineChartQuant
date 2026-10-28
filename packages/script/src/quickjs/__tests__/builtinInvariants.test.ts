/** 全部内置脚本共用的不变量：空输入、预热、确定性、前缀稳定与数值有限。 */
import { describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  builtinScriptNames,
  plotValues,
  runShipped,
  shippedSource,
  wavyCloses,
} from '../../__tests__/marketData.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 只在最后一根 bar 输出的脚本：前缀运行会落在另一根上，不参与前缀比较。 */
function lastBarOnly(name: string): boolean {
  return shippedSource(name).includes('barstate.islast')
}

describe.each(builtinScriptNames())('内置脚本不变量 %s', (name) => {
  it('空输入、重复运行、追加历史与预热都不破坏约定', async () => {
    const source = shippedSource(name)
    // 空输入不产生任何绘图。
    expect(plotValues(await runQuickJSScript({ source, bars: [] })), `${name}: empty`).toEqual({})

    // 同一行情重复运行必须完全一致，脚本状态不能跨运行泄漏。
    const prices = wavyCloses(80)
    const bars = barsFromCloses(prices, { spread: 0.5 })
    const full = await runQuickJSScript({ source, bars })
    const repeated = await runQuickJSScript({ source, bars })
    expect(repeated, `${name}: repeat`).toEqual(full)

    // 输出值全部有限；NaN 与无穷值不允许出现在数据列中。
    const values = plotValues(full)
    for (const [id, series] of Object.entries(values)) {
      expect(
        series.filter((value) => value !== undefined).every(Number.isFinite),
        `${name}.${id}: finite`,
      ).toBe(true)
    }

    // 历史不足时脚本不能抛错；窗口类脚本的预热另由 builtinIndicators 的名单用例覆盖。
    await expect(
      runQuickJSScript({ source, bars: barsFromCloses([10, 11]) }),
    ).resolves.toBeDefined()

    // 追加历史不改写已有前缀；只输出末根的脚本不适用。
    if (lastBarOnly(name)) return
    const prefix = plotValues(await runShipped(name, prices.slice(0, 60), {}, { spread: 0.5 }))
    for (const [id, series] of Object.entries(prefix)) {
      expect(values[id]?.slice(0, 60), `${name}.${id}: prefix`).toEqual(series)
    }
  })
})
