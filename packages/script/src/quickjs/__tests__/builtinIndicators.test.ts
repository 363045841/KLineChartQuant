/** 验证迁移指标的发布源码、预热、数值、参数与 VM 状态隔离。 */
import { describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  builtinScriptNames,
  runShippedBars,
  shippedSource,
  wavyCloses,
} from '../../__tests__/marketData.js'
import { readQuickJSScriptDefinitionSync } from '../impl/runQuickJSScript.js'

describe('迁移的内置指标', () => {
  it('MOM 与 ROC 保留间距预热和零基期留空', async () => {
    const data = barsFromCloses([0, 10, 20, 15, 30])
    expect(await runShippedBars('mom', data, { period: 2 })).toMatchObject({
      mom: [undefined, undefined, 20, 5, 10],
    })
    expect(await runShippedBars('roc', data, { period: 2 })).toMatchObject({
      roc: [undefined, undefined, undefined, 50, 50],
    })
  })

  it('WMA 权重、BOLL 总体标准差和唐奇安窗口边界正确', async () => {
    const data = barsFromCloses([10, 11, 12, 13, 14, 15], { spread: 2 })
    const wma = (await runShippedBars('wma', data, { period: 5 })).wma!
    expect(wma.slice(0, 4)).toEqual(Array(4).fill(undefined))
    expect(wma[4]).toBeCloseTo(190 / 15, 10)
    expect(wma[5]).toBeCloseTo(205 / 15, 10)
    const boll = await runShippedBars('boll', data, { period: 5 })
    expect(boll.middle?.[4]).toBe(12)
    expect(boll.upper?.[4]).toBeCloseTo(12 + 2 * Math.sqrt(2), 10)
    expect(boll.lower?.[5]).toBeCloseTo(13 - 2 * Math.sqrt(2), 10)
    const donchian = await runShippedBars('donchian', data, { period: 5 })
    expect(donchian.upper?.[4]).toBe(16)
    expect(donchian.middle?.[4]).toBe(12)
    expect(donchian.lower?.[5]).toBe(9)
  })

  it.each(['fastk', 'wmsr'])('%s 保留平盘中值与完整窗口预热', async (name) => {
    const values = (await runShippedBars(name, barsFromCloses([10, 10, 10, 10]), { period: 3 }))[
      name
    ]
    const midpoint = name === 'fastk' ? 50 : -50
    expect(values).toEqual([undefined, undefined, midpoint, midpoint])
    const trendingBars = barsFromCloses([10, 11, 12, 13], { spread: 1 })
    const trending = (await runShippedBars(name, trendingBars, { period: 3 }))[name]
    expect(trending?.[2]).toBeCloseTo(name === 'fastk' ? 75 : -25, 10)
  })

  it('RSI 三周期独立预热，保持 Wilder 参考值与平盘规则', async () => {
    const prices = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46, 46.03,
    ]
    const result = await runShippedBars('rsi', barsFromCloses(prices), {
      period1: 14,
      period2: 2,
      period3: 3,
    })
    expect(result.rsi1?.slice(0, 14)).toEqual(Array(14).fill(undefined))
    expect(result.rsi1?.[14]).toBeCloseTo(70.464135, 5)
    expect(result.rsi1?.[15]).toBeCloseTo(66.249619, 5)
    expect(result.rsi2?.[2]).toBeDefined()
    expect(result.rsi3?.[2]).toBeUndefined()
    const flat = await runShippedBars('rsi', barsFromCloses(Array(30).fill(10)))
    expect(flat.rsi1?.[6]).toBe(100)
    expect(flat.rsi2?.[12]).toBe(100)
    expect(flat.rsi3?.[24]).toBe(100)
  })

  it('Stoch 保留 K/D 同时就绪和 J 的外推，不把 J 裁剪到 0~100', async () => {
    const result = await runShippedBars('stoch', barsFromCloses([10, 10, 10, 20, 10]), {
      n: 2,
      m: 2,
    })
    expect(result.k).toEqual([undefined, undefined, 50, 100, 0])
    expect(result.d).toEqual([undefined, undefined, 50, 75, 50])
    expect(result.j).toEqual([undefined, undefined, 50, 150, -100])
  })

  it.each([
    'rsi',
    'mom',
    'roc',
    'wma',
    'boll',
    'donchian',
    'fastk',
    'wmsr',
    'stoch',
    'supertrend',
    'ao',
    'cci',
    'hma',
    'kst',
    'dma',
    'fib',
    'frama',
    'alma',
    'smma',
    'zlema',
    'kama',
    'vidya',
    'lsma',
    'fisher',
    'stoch-rsi',
    'stc',
  ])('%s 在完整窗口前不输出指标值', async (name) => {
    const result = await runShippedBars(name, barsFromCloses([10, 11]))
    for (const [id, series] of Object.entries(result)) {
      if (id.startsWith('guide') || id === 'zero') continue
      expect(
        series.every((value) => value === undefined),
        `${name}.${id}`,
      ).toBe(true)
    }
  })

  /** 显隐开关必须登记；新增开关等于新增用户可见配置，需要在评审时确认。 */
  const VISIBILITY_SWITCHES: Record<string, readonly string[]> = {
    rsi: ['showRSI1', 'showRSI2', 'showRSI3'],
    ma: ['showMA1', 'showMA2', 'showMA3', 'showMA4', 'showMA5'],
    expma: ['showFast', 'showSlow'],
    gmma: ['showShort', 'showLong'],
    structure: ['showSwings', 'showBOS', 'showCHoCH'],
    'volume-profile': ['showPOC', 'showValueArea'],
    zones: ['showFvg', 'showOb'],
  }

  it(
    '逐线/逐元素开关只出现在登记过的脚本里',
    () => {
      for (const name of builtinScriptNames()) {
        const switches = Object.keys(
          readQuickJSScriptDefinitionSync(shippedSource(name)).inputs,
        ).filter((key) => key.startsWith('show'))
        expect(switches, name).toEqual(VISIBILITY_SWITCHES[name] ?? [])
      }
    },
    // 这条用例逐个编译全部内置脚本，CI 上会超过 vitest 默认的 5 秒。
    30_000,
  )

  it('RSI 的逐线开关只隐藏对应那条线', async () => {
    const data = barsFromCloses(wavyCloses(40))
    const all = await runShippedBars('rsi', data)
    const partial = await runShippedBars('rsi', data, { showRSI1: false, showRSI3: false })
    expect(partial.rsi1?.every((value) => value === undefined)).toBe(true)
    expect(partial.rsi3?.every((value) => value === undefined)).toBe(true)
    expect(partial.rsi2).toEqual(all.rsi2)
  })
})
