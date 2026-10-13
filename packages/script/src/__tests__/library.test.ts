/** 验证库注册隔离、内置库序列契约，以及自定义库绑定进执行上下文。 */
import { describe, expect, it } from 'vitest'
import type { Bar } from '../contracts/input.js'
import type { IndicatorDef } from '../contracts/script.js'
import { getDefinedScripts } from '../defineIndicator.js'
import { defineLibrary } from '../defineLibrary.js'
import { executeScript } from '../engine/impl/executeScript.js'
import { importLibrary } from '../importLibrary.js'
import { createLibraryEnvironment } from '../libraryRuntime/impl/createLibraryEnvironment.js'
import { SeriesRuntime } from '../series/impl/seriesRuntime.js'

declare module '../contracts/library.js' {
  /** 用户扩展的类型目录，与内置库走同一机制。 */
  interface LibraryModules {
    userMath: { double(value: number): number }
  }
}

describe('Library', () => {
  it('注册函数表不注册指标，环境之间相互隔离', () => {
    const first = createLibraryEnvironment()
    const second = createLibraryEnvironment()
    const count = getDefinedScripts().length
    const functions = first.defineLibrary('Arithmetic', {
      /** 计算两个数的平均值。 */
      average(a: number, b: number) {
        return (a + b) / 2
      },
    })
    expect(functions.average(10, 20)).toBe(15)
    expect(first.importLibrary('Arithmetic')).toBe(functions)
    expect(() => second.importLibrary('Arithmetic')).toThrow('未加载')
    expect(() => first.defineLibrary('Arithmetic', functions)).toThrow('已声明')
    expect(getDefinedScripts()).toHaveLength(count)
  })

  it('ta 接收运行态序列，返回可读取历史的 SMA', () => {
    const runtime = new SeriesRuntime()
    const ma = importLibrary('ta').sma(runtime.close, 3)
    for (const [index, close] of [10, 20, 30, 40].entries()) {
      runtime.write({ time: index, open: close, high: close, low: close, close, volume: 1 })
    }
    expect(ma[0]).toBe(30)
    expect(ma[1]).toBe(20)
    expect(ma[2]).toBeNaN()
  })

  it.each([0, -1, 1.5, Number.NaN, Infinity])('拒绝非法窗口 %s', (length) => {
    expect(() => importLibrary('ta').sma(new SeriesRuntime().close, length)).toThrow(RangeError)
  })

  it('用户注册的库按目录绑定进执行上下文', () => {
    defineLibrary('userMath', {
      /** 返回输入的两倍。 */
      double(value: number) {
        return value * 2
      },
    })
    const script: IndicatorDef<Record<string, never>> = {
      name: 'UserLibrary',
      inputs: {},
      onBar(ctx) {
        ctx.plot(ctx.userMath.double(ctx.close[0]), { id: 'doubled' })
      },
    }
    const bars: Bar[] = [{ time: 1, open: 3, high: 3, low: 3, close: 3, volume: 1 }]
    expect(executeScript(script, bars).plots[0]?.data[0]?.value).toBe(6)
  })
})
