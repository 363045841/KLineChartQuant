/** 验证 TA 窗口算法的整窗参考值、线性读取与间距类原语。 */
import { describe, expect, it } from 'vitest'
import { barsFromCloses, scriptSource, values, wavyCloses } from '../../__tests__/marketData.js'
import { ScriptExecutionError } from '../../errors.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 与 ta 各算法同约定的整窗参考值；权重由调用方按算法给定的窗口计算。 */
function referenceWindow(
  algorithm: string,
  samples: readonly number[],
  weights: readonly number[],
): number {
  const sum = samples.reduce((total, value) => total + value, 0)
  switch (algorithm) {
    case 'sma':
      return sum / samples.length
    case 'sum':
      return sum
    case 'highest':
      return Math.max(...samples)
    case 'lowest':
      return Math.min(...samples)
    case 'stddev': {
      const mean = sum / samples.length
      return Math.sqrt(
        samples.reduce((total, value) => total + (value - mean) ** 2, 0) / samples.length,
      )
    }
    default: {
      const weightSum = weights.reduce((total, value) => total + value, 0)
      if (weightSum <= 0) return Number.NaN
      return (
        samples.reduce((total, value, step) => total + value * (weights[step] ?? 0), 0) / weightSum
      )
    }
  }
}

/** 参与整窗比对与读取计数的算法清单；rsi 另有递推路径，一并纳入线性检查。 */
const WINDOW_ALGORITHMS = ['sma', 'sum', 'wma', 'highest', 'lowest', 'stddev', 'vwma']

describe('TA 窗口算法', () => {
  it.each(WINDOW_ALGORITHMS)(
    'ta.%s 在跳读、回读和无效值移出后与独立整窗计算一致',
    async (algorithm) => {
      const closes = wavyCloses(120)
      closes[17] = Number.NaN
      closes[18] = Number.NaN
      closes[80] = Number.NaN
      const volumes = closes.map((_value, index) => (index % 19 < 4 ? 0 : index % 7))
      for (const length of [1, 3, 20]) {
        const expression = `ta.${algorithm}(close, ${algorithm === 'vwma' ? 'volume, ' : ''}${length})`
        const result = await runQuickJSScript({
          source: scriptSource(`
            if (time[0] % 7 !== 0 && time[0] !== ${closes.length - 1}) return
            const series = ${expression}
            plot.Line(series[0], 'current')
            plot.Line(series[3], 'previous')
            plot.Line(series[0], 'repeat')
          `),
          bars: barsFromCloses(closes, { volumes }),
        })
        for (const [id, offset] of [
          ['current', 0],
          ['previous', 3],
          ['repeat', 0],
        ] satisfies [string, number][]) {
          const actual = values(result, id)
          for (let index = 0; index < closes.length; index++) {
            const queried = index % 7 === 0 || index === closes.length - 1
            const end = index - offset + 1
            const samples = closes.slice(Math.max(0, end - length), Math.max(0, end))
            const weights =
              algorithm === 'wma'
                ? samples.map((_value, step) => step + 1)
                : volumes.slice(end - length, end)
            const expected =
              queried && end >= length && samples.every(Number.isFinite)
                ? referenceWindow(algorithm, samples, weights)
                : Number.NaN
            if (Number.isNaN(expected)) expect(actual?.[index]).toBeUndefined()
            else expect(actual?.[index]).toBeCloseTo(expected, 8)
          }
        }
      }
    },
  )

  it.each([...WINDOW_ALGORITHMS, 'rsi'])(
    'ta.%s 的行情读取次数不随窗口周期成倍增加',
    async (algorithm) => {
      // 窗口 200、样本 800：O(n×window) 会读到 16 万次，线性实现约 2~4 倍样本数。
      const count = 800
      const length = 200
      const result = await runQuickJSScript({
        source: `
        let reads = 0
        // 记录真实 Series 访问次数，不用墙钟耗时推断复杂度。
        function counted(source: typeof close) {
          return new Proxy(source, {
            get(target, key) {
              if (key !== 'at') return Reflect.get(target, key)
              return (offset: number) => { reads++; return target.at(offset) }
            }
          })
        }
        const prices = counted(close)
        const volumes = counted(volume)
        defineIndicator({ name: 'WindowReads', position: Position.Sub, inputs: {}, onBar() {
          plot.Line(ta.${algorithm}(prices, ${algorithm === 'vwma' ? 'volumes, ' : ''}${length})[0], 'value')
          plot.Line(reads, 'reads')
        } })
      `,
        bars: barsFromCloses(wavyCloses(count)),
      })
      expect(Number.isFinite(values(result, 'value')?.at(-1))).toBe(true)
      // rsi 每根 bar 要各算一次增益与损失，预算按 6 倍读取放宽。
      expect(values(result, 'reads')?.at(-1)).toBeLessThanOrEqual(count * 6)
    },
  )

  it('ta.mom 取相对 length 根之前的差值，历史不足保留空位', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.mom(close, 2)[0], 'mom')
plot.Line(ta.mom(close)[0], 'step')`),
      bars: barsFromCloses([1, 2, 4, 7]),
    })
    expect(values(result, 'mom')).toEqual([undefined, undefined, 3, 5])
    expect(values(result, 'step')).toEqual([undefined, 1, 2, 3])
  })

  it('ta.rising/falling 严格比较历史窗口，平盘为 false，无需逐根单调', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        const barUp: boolean = ta.rising(close, 1)
        const barDn: boolean = ta.falling(close, 1)
        plot.Line(barUp ? 1 : 0, 'up')
        plot.Line(barDn ? 1 : 0, 'down')
        plot.Line(ta.rising(close, 3) ? 1 : 0, 'high')
        plot.Line(ta.falling(close, 3) ? 1 : 0, 'low')`),
      bars: barsFromCloses([3, 1, 2, 4, 4, 2, 3, 0]),
    })
    expect(values(result, 'up')).toEqual([0, 0, 1, 1, 0, 0, 1, 0])
    expect(values(result, 'down')).toEqual([0, 1, 0, 0, 0, 1, 0, 1])
    expect(values(result, 'high')).toEqual([0, 0, 0, 1, 0, 0, 0, 0])
    expect(values(result, 'low')).toEqual([0, 1, 0, 0, 0, 0, 0, 1])
  })

  it('方向判断忽略历史 NaN，当前 NaN 或没有有效历史时为 false', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        const source = ta.change(close)
        plot.Line(ta.rising(source, 2) ? 1 : 0, 'up')
        plot.Line(ta.falling(source, 2) ? 1 : 0, 'down')`),
      bars: barsFromCloses([1, 2, 4, 5]),
    })
    expect(values(result, 'up')).toEqual([0, 0, 1, 0])
    expect(values(result, 'down')).toEqual([0, 0, 0, 0])
  })

  it('ta.change 支持成交量、指定间距及历史索引，保留 NaN', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        const volumeChange: number = ta.change(volume)
        plot.Line(volumeChange, 'change')
        plot.Line(ta.change(volume, 2), 'two')
        plot.Line(ta.change(volume)[1], 'previous')
        plot.Line(ta.change(ta.change(volume)), 'second')`),
      bars: barsFromCloses([1, 2, 3, 4, 5], { volumes: [10, 15, 12, 12, 0] }),
    })
    expect(values(result, 'change')).toEqual([undefined, 5, -3, 0, -12])
    expect(values(result, 'two')).toEqual([undefined, undefined, 2, -3, -12])
    expect(values(result, 'previous')).toEqual([undefined, undefined, 5, -3, 0])
    expect(values(result, 'second')).toEqual([undefined, undefined, -8, 3, -12])
  })

  it.each(['rising', 'falling', 'change'])('ta.%s 拒绝非法周期', async (method) => {
    for (const length of ['0', '-1', '1.5', 'NaN', 'Infinity']) {
      await expect(
        runQuickJSScript({
          source: scriptSource(`ta.${method}(close, ${length})`),
          bars: barsFromCloses([1, 2]),
        }),
      ).rejects.toBeInstanceOf(ScriptExecutionError)
    }
  })

  it('ta.roc 取百分比变化，基准为 0 时留空', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.roc(close, 1)[0], 'roc')`),
      bars: barsFromCloses([1, 2, 4, 0, 5]),
    })
    expect(values(result, 'roc')).toEqual([undefined, 100, 100, -100, undefined])
  })

  it.each([0, -1, 1.5])('ta.sum 拒绝非法窗口 %s', async (length) => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot.Line(ta.sum(close, ${length})[0], 'sum')`),
        bars: barsFromCloses([1, 2, 3]),
      }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
  })
})
