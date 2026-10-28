/** 验证 ta.maxsum 的子段和、端点偏移、预热与 NaN 语义。 */
import { describe, expect, it } from 'vitest'
import { barsFromCloses, requireValues, scriptSource, wavyCloses } from '../../__tests__/marketData.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 窗口长度；脚本与参考实现共用同一个值。 */
const WINDOW = 6

/** 逐根价差；首根没有前值，与 ta.change 一样为 NaN。 */
function priceChanges(closes: readonly number[]): number[] {
  return closes.map((value, index) => (index === 0 ? Number.NaN : value - closes[index - 1]!))
}

/** 整窗参考实现：枚举全部连续子段取最大值；窗口含 NaN 时为 NaN。 */
function referenceMaxsum(samples: readonly number[]): number {
  if (samples.some(Number.isNaN)) return Number.NaN
  let best = -Infinity
  for (let start = 0; start < samples.length; start++) {
    let total = 0
    for (let end = start; end < samples.length; end++) {
      total += samples[end]!
      if (total > best) best = total
    }
  }
  return best
}

/** 在每根 bar 上同时取三个分量，覆盖跳读与回读路径。 */
const SERIES_SCRIPT = scriptSource(`
  const runs = ta.maxsum(ta.change(close), ${WINDOW})
  plot.Line(runs[0][0], 'total')
  plot.Line(runs[1][0], 'start')
  plot.Line(runs[2][0], 'end')
`)

/** 执行脚本并把三个分量转成普通数组。 */
async function runMaxsum(closes: readonly number[]) {
  const result = await runQuickJSScript({ source: SERIES_SCRIPT, bars: barsFromCloses(closes) })
  return {
    total: requireValues(result, 'total'),
    start: requireValues(result, 'start'),
    end: requireValues(result, 'end'),
  }
}

describe('ta.maxsum 最大子段和', () => {
  it('完整窗口内逐根与整窗枚举一致', async () => {
    const closes = wavyCloses(80)
    const changes = priceChanges(closes)
    const { total } = await runMaxsum(closes)
    for (let index = 0; index < closes.length; index++) {
      if (index < WINDOW - 1) {
        expect(total[index], `bar ${index}`).toBeUndefined()
        continue
      }
      const expected = referenceMaxsum(changes.slice(index - WINDOW + 1, index + 1))
      // 参考值为 NaN 表示窗口含无效值，此时脚本同样留空。
      if (Number.isNaN(expected)) expect(total[index], `bar ${index}`).toBeUndefined()
      else expect(total[index], `bar ${index}`).toBeCloseTo(expected, 10)
    }
  })

  it('端点指向价差最大的买卖两根，偏移为负且起点更早', async () => {
    const closes = [10, 9, 8, 9, 10, 11, 12, 11]
    const { total, start, end } = await runMaxsum(closes)
    const last = closes.length - 1
    expect(total[last]).toBe(4)
    expect(start[last]).toBe(-4)
    expect(end[last]).toBe(-1)
    // 端点覆盖的是一段价格路径：起点再向前一根才是买入价。
    expect(closes[last + start[last]! - 1]).toBe(8)
    expect(closes[last + end[last]!]).toBe(12)
  })

  it('返回区间的累计值等于子段和，且不超出窗口', async () => {
    const closes = wavyCloses(60)
    const changes = priceChanges(closes)
    const { total, start, end } = await runMaxsum(closes)
    for (let index = WINDOW - 1; index < closes.length; index++) {
      if (total[index] === undefined) continue
      const from = index + start[index]!
      const to = index + end[index]!
      const sum = changes.slice(from, to + 1).reduce((acc, value) => acc + value, 0)
      expect(sum).toBeCloseTo(total[index]!, 10)
      expect(to - from + 1).toBeLessThanOrEqual(WINDOW)
    }
  })

  it('窗口不足或含 NaN 时三个分量都留空', async () => {
    const closes = wavyCloses(12)
    closes[6] = Number.NaN
    const { total, start, end } = await runMaxsum(closes)
    for (const offset of [WINDOW - 2, 7, closes.length - 1]) {
      expect(total[offset], `bar ${offset}`).toBeUndefined()
      expect(start[offset], `bar ${offset}`).toBeUndefined()
      expect(end[offset], `bar ${offset}`).toBeUndefined()
    }
  })
})
