/** 验证序列历史、派生计算、实时覆盖和执行入口一致性。 */
import { describe, expect, it } from 'vitest'
import type { Bar } from '../../contracts/input.js'
import type { IndicatorDef } from '../../contracts/script.js'
import { executeScript } from '../../engine/impl/executeScript.js'
import { runEngine } from '../../engine/impl/runEngine.js'
import { taLibrary as ta } from '../../Library/ta.js'
import { SeriesRuntime } from '../impl/seriesRuntime.js'

/** 用给定收盘价与时间创建完整行情。 */
function bar(close: number, time: number): Bar {
  return { time, open: close, high: close, low: close, close, volume: 1 }
}

describe('SeriesRuntime', () => {
  it('只读历史引用，拒绝未来、非法偏移与倒序行情', () => {
    const runtime = new SeriesRuntime()
    runtime.write(bar(10, 1))
    runtime.write(bar(20, 2))
    expect(runtime.close[0]).toBe(20)
    expect(runtime.close[1]).toBe(10)
    expect(runtime.close[2]).toBeNaN()
    expect(runtime.time[1]).toBe(1)
    expect(() => runtime.close[-1]).toThrow(RangeError)
    expect(() => runtime.close[0.5]).toThrow(RangeError)
    expect(() => Reflect.set(runtime.close, '0', 99)).toThrow(TypeError)
    expect(() => runtime.write(bar(99, 1))).toThrow(RangeError)
  })

  it('迟调用也补齐历史，嵌套派生序列支持历史引用', () => {
    const runtime = new SeriesRuntime()
    for (const [index, close] of [10, 20, 30, 40].entries()) runtime.write(bar(close, index))
    const ma = ta.sma(runtime.close, 2)
    expect(ma[0]).toBe(35)
    expect(ma[1]).toBe(25)
    expect(ta.sma(ma, 2)[0]).toBe(30)
    expect(ta.highest(runtime.close, 3)[0]).toBe(40)
    expect(ta.lowest(runtime.close, 3)[0]).toBe(20)
    expect(ta.sma(runtime.close, 2)).toBe(ma)
  })

  it('实时覆盖从上一根已完成状态重算 EMA，不重复推进', () => {
    const runtime = new SeriesRuntime()
    const ema = ta.ema(runtime.close, 3)
    for (const [index, close] of [10, 20, 30, 40].entries()) {
      runtime.write(bar(close, index))
      void ema[0]
    }
    expect(ema[0]).toBe(30)
    runtime.write(bar(60, 3))
    expect(ema[0]).toBe(40)
    expect(ema[1]).toBe(20)
    runtime.write(bar(60, 3))
    expect(ema[0]).toBe(40)
    runtime.write(bar(80, 3))
    runtime.write(bar(100, 4))
    expect(ema[0]).toBe(75)
    expect(ema[1]).toBe(50)
    const other = new SeriesRuntime()
    other.write(bar(100, 0))
    expect(ta.ema(other.close, 3)[0]).toBeNaN()
  })

  it('Wilder RSI 保持历史结果并处理上涨、下跌和平盘', () => {
    const runtime = new SeriesRuntime()
    for (const [index, close] of [10, 20, 30, 20].entries()) runtime.write(bar(close, index))
    const rsi = ta.rsi(runtime.close, 2)
    expect(rsi[0]).toBe(50)
    expect(rsi[1]).toBe(100)
    expect(rsi[2]).toBeNaN()
    runtime.write(bar(30, 3))
    expect(rsi[0]).toBe(100)
  })

  it('同步与流式入口产生同样的序列结果，覆盖保持原输出位置', async () => {
    const bars = [bar(10, 0), bar(20, 1), bar(30, 2)]
    const script: IndicatorDef<Record<string, never>> = {
      name: 'MA',
      inputs: {},
      onBar({ close, ta, plot }) {
        plot(ta.sma(close, 2)[0], { id: 'ma' })
      },
    }
    const values: number[] = []
    const result = await runEngine({
      script,
      symbol: 'TEST',
      tf: '1m',
      feed: {
        async *history() {
          yield* bars
          yield bar(50, 2)
        },
      },
      sink: {
        onPlot(_id, index, point) {
          values[index] = point.value
        },
        onEvent() {},
      },
    })
    expect(result.barCount).toBe(3)
    expect(values).toEqual([NaN, 15, 35])
    const expected = executeScript(script, [...bars.slice(0, 2), bar(50, 2)])
    expect(expected.plots[0]?.data.map((point) => point?.value)).toEqual(values)
    const revised = executeScript(script, [...bars, bar(50, 2)])
    expect(revised.plots[0]?.data.map((point) => point?.value)).toEqual(values)
  })
})
