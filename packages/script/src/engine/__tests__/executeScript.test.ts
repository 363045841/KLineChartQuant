import { describe, expect, it } from 'vitest'
import type { IndicatorDef } from '../../contracts/script.js'
import { executeScript } from '../impl/executeScript.js'

describe('executeScript', () => {
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
