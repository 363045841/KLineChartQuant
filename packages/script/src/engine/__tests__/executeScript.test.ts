import { describe, expect, it } from 'vitest'
import type { IndicatorDef } from '../../contracts/script.js'
import { SCRIPT_ERROR_CODES, ScriptPlotError } from '../../errors.js'
import { openCloseAverage } from '../../indicators/openCloseAverage.js'
import { executeScript } from '../impl/executeScript.js'

/** 运行测试使用可编辑参数类型，默认值不限制后续输入值。 */
const editableAverage: IndicatorDef<{ n: number; a: number }> = openCloseAverage

describe('executeScript', () => {
  it.each([0, -0])('除数 %s 的无穷大输出产生带位置的运行错误，恢复参数后可重新执行', (n) => {
    const bars = [{ time: 1, open: 100, high: 102, low: 98, close: 100, volume: 1 }]
    expect(() => executeScript(editableAverage, bars, { n })).toThrow(ScriptPlotError)
    expect(() => executeScript(editableAverage, bars, { n })).toThrow(
      expect.objectContaining({
        code: SCRIPT_ERROR_CODES.INFINITE_PLOT_VALUE,
        plotId: 'oc-average',
        barIndex: 0,
      }),
    )
    expect(executeScript(editableAverage, bars, { n: 4 }).plots[0]?.data[0]?.value).toBe(50)
  })

  it('NaN 保留为空点，不触发运行错误', () => {
    const script: IndicatorDef<Record<string, never>> = {
      name: 'empty-point',
      inputs: {},
      onBar(ctx) {
        ctx.plot(NaN, { id: 'line' })
      },
    }
    const bars = [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]
    expect(executeScript(script, bars).plots[0]?.data[0]?.value).toBeNaN()
  })
  it('按 id 和 bar 下标收集条件输出，参数变化生成全新结果', () => {
    const script: IndicatorDef<{ factor: number }> = {
      name: 'conditional',
      inputs: { factor: { default: 1 } },
      plots: [
        { id: 'close', kind: 'line' },
        { id: 'empty', kind: 'points' },
      ],
      onBar(ctx, params) {
        if (ctx.close > 1) ctx.plot(ctx.close * params.factor, { id: 'close', color: 'red' })
      },
    }
    const bars = [1, 2, 3].map((close) => ({
      time: close,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    }))
    const first = executeScript(script, bars)
    const second = executeScript(script, bars.slice(0, 2), { factor: 2 })
    expect(first.plots[0]?.data).toEqual([
      undefined,
      { value: 2, color: 'red' },
      { value: 3, color: 'red' },
    ])
    expect(first.plots[1]?.data).toEqual([undefined, undefined, undefined])
    expect(second.plots[0]?.data).toEqual([undefined, { value: 4, color: 'red' }])
    expect(first.plots[0]?.data[1]?.value).toBe(2)
  })
  it('填充引用声明的 Plot，拒绝无法找到的边界', () => {
    const script: IndicatorDef<Record<string, never>> = {
      name: 'fill',
      inputs: {},
      plots: [
        { id: 'a', kind: 'line' },
        { id: 'b', kind: 'histogram' },
      ],
      fills: [{ id: 'cloud', from: 'a', to: 'b' }],
      onBar() {},
    }
    expect(executeScript(script, []).fills[0]).toMatchObject({ from: 'a', to: 'b' })
    expect(() =>
      executeScript({ ...script, fills: [{ id: 'bad', from: 'a', to: 'missing' }] }, []),
    ).toThrow('Unknown fill source')
  })
})
