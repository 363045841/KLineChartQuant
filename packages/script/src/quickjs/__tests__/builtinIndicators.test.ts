/** 验证迁移指标的发布源码、预热、数值、参数与 VM 状态隔离。 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Bar } from '../../contracts/input.js'
import { builtinScriptSources } from '../generated/builtinScripts.js'
import {
  preloadQuickJS,
  readQuickJSScriptDefinitionSync,
  runQuickJSScript,
} from '../impl/runQuickJSScript.js'

const names = ['rsi', 'mom', 'roc', 'wma', 'boll', 'donchian', 'fastk', 'wmsr', 'stoch']

/** 直接读取随包源码，测试不保留另一份指标实现。 */
function source(name: string): string {
  return readFileSync(new URL(`../../../scripts/${name}.ts`, import.meta.url), 'utf8')
}

/** 以完整 OHLC 构造确定性的行情，支持测试平盘与零基期。 */
function bars(closes: readonly number[], spread = 0): Bar[] {
  return closes.map((close, time) => ({
    time,
    open: close,
    high: close + spread,
    low: close - spread,
    close,
    volume: 100,
  }))
}

/** 执行发布源码并按绘图身份提取数值，缺失点保持 undefined。 */
async function run(
  name: string,
  data: readonly Bar[],
  params: Record<string, number | boolean> = {},
) {
  const result = await runQuickJSScript({ source: source(name), bars: data, params })
  return Object.fromEntries(
    result.plots.map((plot) => [plot.id, plot.data.map((point) => point?.value)]),
  )
}

describe('迁移的内置指标', () => {
  beforeAll(preloadQuickJS)
  it.each(names)('%s 由 Script 包自动分发且完整窗口前无指标值', async (name) => {
    expect(builtinScriptSources).toContain(source(name))
    expect(readQuickJSScriptDefinitionSync(source(name)).indicatorType).toBeDefined()
    const result = await run(name, bars([10, 11]))
    for (const [id, values] of Object.entries(result)) {
      if (!id.startsWith('guide') && id !== 'zero')
        expect(values.every((value) => value === undefined)).toBe(true)
    }
    expect(await run(name, [])).toEqual({})
  })

  it('MOM 与 ROC 保留间距预热和零基期留空', async () => {
    const data = bars([0, 10, 20, 15, 30])
    expect((await run('mom', data, { period: 2 })).mom).toEqual([undefined, undefined, 20, 5, 10])
    expect((await run('roc', data, { period: 2 })).roc).toEqual([
      undefined,
      undefined,
      undefined,
      50,
      50,
    ])
  })

  it('WMA 权重、BOLL 总体标准差和唐奇安窗口边界正确', async () => {
    const data = bars([10, 11, 12, 13, 14, 15], 2)
    const wma = (await run('wma', data, { period: 5 })).wma!
    expect(wma.slice(0, 4)).toEqual(Array(4).fill(undefined))
    expect(wma[4]).toBeCloseTo(190 / 15, 10)
    expect(wma[5]).toBeCloseTo(205 / 15, 10)
    const boll = await run('boll', data, { period: 5 })
    expect(boll.middle?.[4]).toBe(12)
    expect(boll.upper?.[4]).toBeCloseTo(12 + 2 * Math.sqrt(2), 10)
    expect(boll.lower?.[5]).toBeCloseTo(13 - 2 * Math.sqrt(2), 10)
    const donchian = await run('donchian', data, { period: 5 })
    expect(donchian.upper?.[4]).toBe(16)
    expect(donchian.middle?.[4]).toBe(12)
    expect(donchian.lower?.[5]).toBe(9)
  })

  it.each(['fastk', 'wmsr'])('%s 保留平盘中值与完整窗口预热', async (name) => {
    const values = (await run(name, bars([10, 10, 10, 10]), { period: 3 }))[name]
    const midpoint = name === 'fastk' ? 50 : -50
    expect(values).toEqual([undefined, undefined, midpoint, midpoint])
    const trending = (await run(name, bars([10, 11, 12, 13], 1), { period: 3 }))[name]
    expect(trending?.[2]).toBeCloseTo(name === 'fastk' ? 75 : -25, 10)
  })

  it('RSI 三周期独立预热，保持 Wilder 参考值与平盘规则', async () => {
    const prices = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46, 46.03,
    ]
    const result = await run('rsi', bars(prices), { period1: 14, period2: 2, period3: 3 })
    expect(result.rsi1?.slice(0, 14)).toEqual(Array(14).fill(undefined))
    expect(result.rsi1?.[14]).toBeCloseTo(70.464135, 5)
    expect(result.rsi1?.[15]).toBeCloseTo(66.249619, 5)
    expect(result.rsi2?.[2]).toBeDefined()
    expect(result.rsi3?.[2]).toBeUndefined()
    const flat = await run('rsi', bars(Array(30).fill(10)))
    expect(flat.rsi1?.[6]).toBe(100)
    expect(flat.rsi2?.[12]).toBe(100)
    expect(flat.rsi3?.[24]).toBe(100)
  })

  it('Stoch 保留 K/D 同时就绪和 J 的外推，不把 J 裁剪到 0~100', async () => {
    const result = await run('stoch', bars([10, 10, 10, 20, 10]), { n: 2, m: 2 })
    expect(result.k).toEqual([undefined, undefined, 50, 100, 0])
    expect(result.d).toEqual([undefined, undefined, 50, 75, 50])
    expect(result.j).toEqual([undefined, undefined, 50, 150, -100])
  })

  it('只有同族平行多线声明逐线开关，整体图形不拆分', () => {
    const switches = (name: string) =>
      Object.keys(readQuickJSScriptDefinitionSync(source(name)).inputs).filter((key) =>
        key.startsWith('show'),
      )
    expect(switches('rsi')).toEqual(['showRSI1', 'showRSI2', 'showRSI3'])
    for (const name of names.filter((item) => item !== 'rsi')) expect(switches(name)).toEqual([])
  })

  it('RSI 的逐线开关只隐藏对应那条线', async () => {
    const data = bars(Array.from({ length: 40 }, (_, index) => 10 + Math.sin(index) * 3))
    const all = await run('rsi', data)
    const partial = await run('rsi', data, { showRSI1: false, showRSI3: false })
    expect(partial.rsi1?.every((value) => value === undefined)).toBe(true)
    expect(partial.rsi3?.every((value) => value === undefined)).toBe(true)
    expect(partial.rsi2).toEqual(all.rsi2)
  })

  it.each(['rsi', 'stoch'])('%s 重算和追加历史不泄漏脚本状态', async (name) => {
    const data = bars(Array.from({ length: 50 }, (_, index) => 50 + Math.sin(index) * 10))
    const full = await run(name, data)
    expect(await run(name, data)).toEqual(full)
    const prefix = await run(name, data.slice(0, 35))
    for (const [id, values] of Object.entries(prefix))
      expect(full[id]?.slice(0, 35)).toEqual(values)
  })
})
