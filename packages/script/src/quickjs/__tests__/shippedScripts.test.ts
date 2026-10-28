/** 验证随包示例脚本：OC Average 的距离阈值与 SMA 示例的算法输出。 */
import { describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  plotValues,
  shippedSource,
  values,
  wavyCloses,
} from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import { readQuickJSScriptDefinitionSync, runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 随包发布的 SMA 示例源码；直接读磁盘，避免测试里复制一份脚本。 */
const shippedSmaSource = shippedSource('sma')
/** 直接执行 OC Average 源码，验证参数和距离信号。 */
const shippedOcSource = shippedSource('open-close-average')

/** 与 ta.ema 同约定的参考实现：首个完整窗口 SMA 初始化，之后按 2/(length+1) 递推。 */
function referenceEma(closes: readonly number[], length: number): number[] {
  const out = new Array<number>(closes.length).fill(Number.NaN)
  if (closes.length < length) return out
  let window = 0
  for (let index = 0; index < length; index++) window += closes[index] ?? 0
  let ema = window / length
  out[length - 1] = ema
  for (let index = length; index < closes.length; index++) {
    ema += (2 / (length + 1)) * ((closes[index] ?? Number.NaN) - ema)
    out[index] = ema
  }
  return out
}

/** OC 示例距离比较的一行用例：高低点绝对值直接给出，用于锁定阈值边界。 */
interface OcCase {
  readonly distance: number
  readonly a: number
  /** 期望的 oc-near 数值序列；null 表示该组参数下不产生信号图形。 */
  readonly near: readonly (number | undefined)[] | null
  readonly closes: readonly number[]
  readonly highs: readonly number[]
  readonly lows: readonly number[]
}

/** 默认两根行情：high 上浮 0.5、low 下浮 0.25。 */
const OC_DEFAULT_CASE = { closes: [0, 10], highs: [0.5, 10.5], lows: [-0.25, 9.75] }

/** 用 close 与绝对高低点构造行情。 */
function ocBars(row: OcCase): Bar[] {
  return barsFromCloses(row.closes, { highs: row.highs, lows: row.lows })
}

describe('随包 OC Average 示例', () => {
  it.each<OcCase>([
    { ...OC_DEFAULT_CASE, distance: 0.75, a: 0, near: [0, 10] },
    { ...OC_DEFAULT_CASE, distance: 0.5, a: 0, near: null },
    { ...OC_DEFAULT_CASE, distance: 0.6, a: 0.4, near: null },
    { ...OC_DEFAULT_CASE, distance: 0.6, a: -0.4, near: null },
    { ...OC_DEFAULT_CASE, distance: 0, a: 0, near: null },
    // 只有中间一根落到阈值内：标记该 bar，前后保持空位，信号消失不残留。
    {
      distance: 1,
      a: 0,
      near: [undefined, 20, undefined],
      closes: [10, 20, 30],
      highs: [12, 20.5, 32],
      lows: [9.75, 19.75, 29.75],
    },
  ])(
    'OC Average 仅在两侧距离严格小于阈值时绘制 Shape（distance=$distance, offset=$a）',
    async (row) => {
      const result = await runQuickJSScript({
        source: shippedOcSource,
        bars: ocBars(row),
        params: { distance: row.distance, a: row.a },
      })
      const signal = result.plots.find((plot) => plot.id === 'oc-near')
      if (row.near === null) {
        expect(signal).toBeUndefined()
      } else {
        expect(signal).toMatchObject({
          kind: 'shape',
          style: 'triangleup',
          location: 'absolute',
          size: 'small',
        })
        expect(values(result, 'oc-near')).toEqual(row.near)
      }
      expect(values(result, 'oc-high')).toEqual(row.highs)
      expect(values(result, 'oc-low')).toEqual(row.lows)
    },
  )
})

describe('随包 SMA 示例脚本', () => {
  it('声明业务分类、周期参数与算法下拉', () => {
    const definition = readQuickJSScriptDefinitionSync(shippedSmaSource)
    expect(definition.inputs).toEqual({
      period: { default: 20, title: '周期', min: 1, step: 1 },
      type: { default: 'SMA', title: '算法', options: ['SMA', 'EMA', 'WMA', 'VWMA'] },
    })
  })

  // 收盘价与成交量都取 1..4、周期 3，期望值即各算法的窗口计算结果。
  it.each([
    ['SMA', [undefined, undefined, 2, 3]],
    ['EMA', [undefined, undefined, 2, 3]],
    ['WMA', [undefined, undefined, 14 / 6, 20 / 6]],
    ['VWMA', [undefined, undefined, 14 / 6, 29 / 9]],
  ])('算法 %s 产出对应的均线序列', async (type, expected) => {
    const result = await runQuickJSScript({
      source: shippedSmaSource,
      bars: barsFromCloses([1, 2, 3, 4], { volumes: [1, 2, 3, 4] }),
      params: { period: 3, type },
    })
    expect(values(result, 'sma')).toEqual(expected)
  })

  it('长序列下 EMA 结果与独立参考实现一致', async () => {
    const closes = wavyCloses(2000)
    const result = await runQuickJSScript({
      source: shippedSmaSource,
      bars: barsFromCloses(closes),
      params: { period: 20, type: 'EMA' },
    })
    const actual = values(result, 'sma')
    const expected = referenceEma(closes, 20)
    expect(actual).toHaveLength(closes.length)
    for (let index = 0; index < closes.length; index++) {
      const expectedValue = expected[index] ?? Number.NaN
      // 计算预热区的无效数值在采集时变为空位。
      if (Number.isNaN(expectedValue)) expect(actual?.[index]).toBeUndefined()
      else expect(actual?.[index]).toBeCloseTo(expectedValue, 9)
    }
  })

  it('参数缺失时落回声明默认值', async () => {
    const result = await runQuickJSScript({
      source: shippedSmaSource,
      bars: barsFromCloses([1, 2, 3, 4], { volumes: [1, 2, 3, 4] }),
    })
    // 周期 20 超过样本数，SMA 全程留空。
    expect(plotValues(result).sma?.every((value) => value === undefined)).toBe(true)
  })
})
