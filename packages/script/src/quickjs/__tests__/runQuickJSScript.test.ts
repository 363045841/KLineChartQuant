/** 验证 QuickJS 脚本执行器：全局序列、ta、params、错误、运行隔离与随包示例脚本。 */
import { readdirSync, readFileSync } from 'node:fs'
import { Color } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { barsFromCloses, scriptSource, values, wavyCloses } from '../../__tests__/marketData.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { builtinScriptSources } from '../generated/builtinScripts.js'
import { readQuickJSScriptDefinitionSync, runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 随包发布的 SMA 示例源码；直接读磁盘，避免测试里复制一份脚本。 */
const shippedSmaSource = readFileSync(new URL('../../../scripts/sma.ts', import.meta.url), 'utf8')
/** 直接执行发布的 Shape 示例，验证全部形状声明和实际逐 bar 输出。 */
const shippedShapeSource = readFileSync(
  new URL('../../../scripts/shape.ts', import.meta.url),
  'utf8',
)

/** 直接执行 OC Average 源码，验证参数和距离信号。 */
const shippedOcSource = readFileSync(
  new URL('../../../scripts/open-close-average.ts', import.meta.url),
  'utf8',
)

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

/** 与 ta.stddev 同约定的参考实现：窗口内相对窗口均值的总体标准差（除以 length）。 */
function referenceStddev(closes: readonly number[], length: number): number[] {
  const out = new Array<number>(closes.length).fill(Number.NaN)
  for (let index = length - 1; index < closes.length; index++) {
    let sum = 0
    for (let step = 0; step < length; step++) sum += closes[index - step] ?? 0
    const mean = sum / length
    let variance = 0
    for (let step = 0; step < length; step++) {
      const deviation = (closes[index - step] ?? 0) - mean
      variance += deviation * deviation
    }
    out[index] = Math.sqrt(variance / length)
  }
  return out
}

describe('runQuickJSScript', () => {
  it.each(['sma', 'sum', 'wma', 'highest', 'lowest', 'stddev', 'vwma'])(
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
            plot.Line(series[0], { id: 'current' })
            plot.Line(series[3], { id: 'previous' })
            plot.Line(series[0], { id: 'repeat' })
          `),
          bars: barsFromCloses(closes, volumes),
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

  it.each(['sma', 'sum', 'wma', 'highest', 'lowest', 'stddev', 'vwma'])(
    'ta.%s 的行情读取次数不随窗口周期成倍增加',
    async (algorithm) => {
      const count = 2000
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
          defineIndicator({ name: 'WindowReads', inputs: {}, onBar() {
            plot.Line(ta.${algorithm}(prices, ${algorithm === 'vwma' ? 'volumes, ' : ''}1000)[0], { id: 'value' })
            plot.Line(reads, { id: 'reads' })
          } })
        `,
        bars: barsFromCloses(wavyCloses(count)),
      })
      expect(Number.isFinite(values(result, 'value')?.at(-1))).toBe(true)
      expect(values(result, 'reads')?.at(-1)).toBeLessThanOrEqual(count * 3)
    },
  )

  it.each(['Line', 'Histogram', 'Point', 'Shape', 'Char', 'Arrow'])(
    '%s 用 null 主动留空，NaN 被过滤，同一 bar 的 null 清除先前输出',
    async (kind) => {
      const result = await runQuickJSScript({
        source: scriptSource(`
          plot.${kind}(close[0], { id: 'signal' })
          if (close[0] === 2) plot.${kind}(null, { id: 'signal' })
          if (close[0] === 3) plot.${kind}(NaN, { id: 'signal' })
          plot.${kind}(null, { id: 'empty' })
        `),
        bars: barsFromCloses([1, 2, 3, 4]),
      })
      expect(values(result, 'signal')).toEqual([1, undefined, undefined, 4])
      expect(values(result, 'empty')).toEqual([undefined, undefined, undefined, undefined])
    },
  )

  it('生成的内置目录覆盖 scripts 下全部 TS 文件，不维护第二份名单', () => {
    const directory = new URL('../../../scripts/', import.meta.url)
    const sources = readdirSync(directory)
      .filter((file) => file.endsWith('.ts'))
      .sort()
      .map((file) => readFileSync(new URL(file, directory), 'utf8'))
    expect(builtinScriptSources).toEqual(sources)
  })

  it('声明式 Char 和 Arrow 使用共享默认值，调用只需提供 id', async () => {
    const result = await runQuickJSScript({
      source: `defineIndicator({
        name: 'Declared markers', inputs: {},
        plots: [
          { id: 'char', kind: PlotKind.Char },
          { id: 'arrow', kind: PlotKind.Arrow, colorUp: 'green', colorDown: 'red' }
        ],
        onBar() {
          plot.Char(true, { id: 'char' })
          plot.Arrow(close[0], { id: 'arrow' })
        }
      })`,
      bars: barsFromCloses([1, -2]),
    })
    expect(result.plots[0]).toMatchObject({
      kind: 'char',
      char: '★',
      location: 'abovebar',
      size: 'auto',
    })
    expect(result.plots[1]).toMatchObject({
      kind: 'arrow',
      size: 'auto',
      colorUp: 'green',
      colorDown: 'red',
    })
  })

  it('Char 支持布尔条件、Unicode 字符和逐 bar 颜色', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Char(close[0] > 1, {
        id: 'char', char: '🠅', location: ShapeLocation.BelowBar,
        color: close[0] > 2 ? 'red' : 'blue', text: '买入'
      })`),
      bars: barsFromCloses([1, 2, 3]),
    })
    expect(values(result, 'char')).toEqual([undefined, 1, 1])
    expect(result.plots[0]).toMatchObject({
      kind: 'char',
      char: '🠅',
      location: 'belowbar',
      text: '买入',
    })
    expect(result.plots[0]?.data.map((point) => point?.color)).toEqual([undefined, 'blue', 'red'])
  })

  it('Arrow 保留有符号数值并采集逐 bar 方向颜色', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Arrow(close[0], {
        id: 'arrow', colorUp: close[0] > 1 ? 'green' : 'blue', colorDown: 'red',
        size: ShapeSize.Large
      })`),
      bars: barsFromCloses([1, -2, 0, 10]),
    })
    expect(values(result, 'arrow')).toEqual([1, -2, 0, 10])
    expect(result.plots[0]).toMatchObject({ kind: 'arrow', size: 'large' })
    expect(result.plots[0]?.data.map((point) => point?.color)).toEqual([
      'blue',
      'red',
      'red',
      'green',
    ])
  })

  it.each([
    `plot.Arrow(true, { id: 'bad' })`,
    `plot.Point(1, { id: 'bad', size: 'gigantic' })`,
    `plot.Char(true, { id: 'bad', char: 'AB' })`,
    `plot.Char(true, { id: 'bad', char: close[0] > 1 ? 'A' : 'B' })`,
  ])('拒绝无效参数或整轮变化的字符：%s', async (body) => {
    await expect(
      runQuickJSScript({ source: scriptSource(body), bars: barsFromCloses([1, 2]) }),
    ).rejects.toThrow()
  })

  it.each(['char', 'arrow'])('执行随包发布的 %s 示例', async (name) => {
    const source = readFileSync(new URL(`../../../scripts/${name}.ts`, import.meta.url), 'utf8')
    const bars = barsFromCloses([2, 1, 3]).map((bar) => ({ ...bar, open: 2 }))
    const result = await runQuickJSScript({ source, bars })
    expect(result.plots.length).toBeGreaterThan(0)
    expect(result.plots.every((plot) => plot.kind === name)).toBe(true)
  })

  it.each([
    { distance: 0.75, a: 0, expected: true },
    { distance: 0.5, a: 0, expected: false },
    { distance: 0.6, a: 0.4, expected: false },
    { distance: 0.6, a: -0.4, expected: false },
    { distance: 0, a: 0, expected: false },
  ])(
    'OC Average 两侧距离都严格小于 $distance（偏移 $a）才绘制 Shape',
    async ({ distance, a, expected }) => {
      const bars = barsFromCloses([0, 10]).map((bar) => ({
        ...bar,
        high: bar.close + 0.5,
        low: bar.close - 0.25,
      }))
      const result = await runQuickJSScript({
        source: shippedOcSource,
        bars,
        params: { distance, a },
      })
      expect(readQuickJSScriptDefinitionSync(shippedOcSource).plots).toBeUndefined()
      const signal = result.plots.find((plot) => plot.id === 'oc-near')
      if (expected) {
        expect(signal).toMatchObject({
          kind: 'shape',
          style: 'triangleup',
          location: 'absolute',
          size: 'small',
        })
        expect(values(result, 'oc-near')).toEqual([a, 10 + a])
      } else {
        expect(signal).toBeUndefined()
      }
      expect(values(result, 'oc-high')).toEqual([0.5, 10.5])
      expect(values(result, 'oc-low')).toEqual([-0.25, 9.75])
    },
  )

  it('OC Average 条件调用保留未触发 bar 的空位，信号消失后不残留标记', async () => {
    const bars = barsFromCloses([10, 20, 30]).map((bar, index) => ({
      ...bar,
      high: bar.close + (index === 1 ? 0.5 : 2),
      low: bar.close - 0.25,
    }))
    const result = await runQuickJSScript({ source: shippedOcSource, bars })
    expect(values(result, 'oc-near')).toEqual([undefined, 20, undefined])
  })

  it('plot 调用直接配置 Shape 样式，形状和文字颜色可以逐 bar 改变', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Shape(close[0], {
        id: 'signal', style: ShapeStyle.LabelUp, location: ShapeLocation.Absolute,
        size: ShapeSize.Small, text: '信号', offset: 1,
        color: close[0] === 2 ? 'red' : 'green', textColor: close[0] === 2 ? 'blue' : 'red',
      })`),
      bars: barsFromCloses([2, 4]),
    })
    expect(result.plots[0]).toMatchObject({
      kind: 'shape',
      style: 'labelup',
      location: 'absolute',
      size: 'small',
      text: '信号',
      offset: 1,
      data: [
        { value: 2, color: 'red', textColor: 'blue' },
        { value: 4, color: 'green', textColor: 'red' },
      ],
    })
  })

  it('同一 id 不允许逐 bar 改变整列形状样式', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(
          `plot.Shape(true, { id: 'signal', style: close[0] === 2 ? ShapeStyle.Circle : ShapeStyle.Square })`,
        ),
        bars: barsFromCloses([2, 4]),
      }),
    ).rejects.toThrow('cannot change style')
  })

  it('直接调用的 Shape 样式使用与 plots 声明相同的校验', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot.Shape(true, { id: 'signal', style: 'unknown' })`),
        bars: barsFromCloses([2]),
      }),
    ).rejects.toThrow('无效 plot 调用参数')
  })

  it('发布的 Shape Gallery 在 12 根行情上依次输出全部形状', async () => {
    const result = await runQuickJSScript({
      source: shippedShapeSource,
      bars: barsFromCloses(wavyCloses(12)),
    })
    expect(result.plots).toHaveLength(12)
    for (const [index, plot] of result.plots.entries()) {
      expect(plot.kind).toBe('shape')
      expect(plot.data.filter((point) => point?.value === 1)).toHaveLength(1)
      expect(plot.data[index]?.value).toBe(1)
    }
  })

  it('Shape 的枚举、声明和布尔输出贯通同一个 PlotCollector', async () => {
    const result = await runQuickJSScript({
      source: `defineIndicator({
        name: 'Signals', inputs: {},
        plots: [{ id: 'buy', kind: PlotKind.Shape, style: ShapeStyle.LabelUp,
          location: ShapeLocation.BelowBar, size: ShapeSize.Small, text: '买入', offset: 1 }],
        onBar() { plot.Shape(close[0] > 2, { id: 'buy', color: 'red', textColor: 'blue' }) }
      })`,
      bars: barsFromCloses([2, 4]),
    })
    expect(result.plots[0]).toMatchObject({
      kind: 'shape',
      style: 'labelup',
      location: 'belowbar',
      size: 'small',
      text: '买入',
      offset: 1,
      data: [undefined, { value: 1, color: 'red', textColor: 'blue' }],
    })
  })

  it('Shape 的数值 0 保留在数据列中', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot.Shape(close[0] - 2, { id: 'signal', location: ShapeLocation.Top })`,
      ),
      bars: barsFromCloses([2, 4]),
    })
    expect(values(result, 'signal')).toEqual([0, 2])
  })

  it('未声明的 Shape 仍走统一动态 id 收集，缺省为 xcross/abovebar/auto', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Shape(true, { id: 'signal' })`),
      bars: barsFromCloses([2]),
    })
    expect(result.plots[0]).toMatchObject({
      kind: 'shape',
      style: 'xcross',
      location: 'abovebar',
      size: 'auto',
      data: [{ value: 1 }],
    })
  })

  it.each(["style: 'star'", "location: 'middle'", "size: 'giant'", 'text: 12', 'textColor: false'])(
    'Shape 声明拒绝无效字段 %s',
    async (field) => {
      await expect(
        runQuickJSScript({
          source: `defineIndicator({ name: 'BadShape', inputs: {}, plots: [{ id: 'bad', kind: 'shape', ${field} }], onBar() {} })`,
          bars: [],
        }),
      ).rejects.toThrow('无效 plots')
    },
  )

  it('相对 Shape 不能作为 fill 的价格边界', async () => {
    await expect(
      runQuickJSScript({
        source: `defineIndicator({ name: 'BadFill', inputs: {},
        plots: [{ id: 'signal', kind: 'shape' }, { id: 'price', kind: 'line' }],
        fills: [{ id: 'cloud', from: 'signal', to: 'price' }], onBar() {} })`,
        bars: [],
      }),
    ).rejects.toThrow('requires price-positioned plots')
  })

  it.each([
    ['Line', 'line'],
    ['Histogram', 'histogram'],
    ['Point', 'points'],
    ['Shape', 'shape'],
    ['Char', 'char'],
    ['Arrow', 'arrow'],
  ])('从 QuickJS Global 调用 plot.%s 并生成对应图形', async (member, kind) => {
    const result = await runQuickJSScript({
      source: scriptSource(`
         if (plot !== globalThis.plot) throw new Error('绘图全局不一致')
         globalThis.plot.${member}(close[0], { id: 'shape' })
      `),
      bars: barsFromCloses([2, 4]),
    })
    expect(result.plots[0]?.kind).toBe(kind)
    expect(values(result, 'shape')).toEqual([2, 4])
  })

  it.each([
    ['Main', 'main'],
    ['Sub', 'sub'],
  ])('从 QuickJS Global 读取 PaneKind.%s 作为指标注册位置', (member, expected) => {
    const source = `defineIndicator({ name: 'PaneEnum', pane: globalThis.PaneKind.${member}, inputs: {}, onBar() {
      if (PaneKind !== globalThis.PaneKind) throw new Error('枚举全局不一致')
    } })`
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({ pane: expected })
  })

  it('业务分类从声明贯通到元数据，VM 枚举与共享契约一致', () => {
    const source = `defineIndicator({
      name: 'Typed', pane: PaneKind.Sub, indicatorType: IndicatorType.Momentum, inputs: {},
      onBar() {
        if (IndicatorType !== globalThis.IndicatorType) throw new Error('枚举全局不一致')
      }
    })`
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({ indicatorType: 'momentum' })
  })

  it('Color 常用色枚举在 VM 中与共享契约逐项一致', () => {
    // 成员表由契约生成，用例只比对色值，不复制一份调色板。
    const checks = Object.entries(Color)
      .map(
        ([member, value]) =>
          `if (Color.${member} !== ${JSON.stringify(value)}) throw new Error('Color.${member} 与契约不一致')`,
      )
      .join('\n')
    const source = `${checks}\ndefineIndicator({ name: 'ColorEnum', inputs: {}, onBar() {} })`
    expect(readQuickJSScriptDefinitionSync(source).name).toBe('ColorEnum')
  })

  it('Color 取值可直接作为绘图颜色', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(close[0], { id: 'line', color: Color.Teal })`),
      bars: barsFromCloses([2, 4]),
    })
    expect(result.plots[0]?.data.map((point) => point?.color)).toEqual([Color.Teal, Color.Teal])
  })

  it('未声明业务分类时元数据不写该字段，由 core 归入 other', () => {
    expect(
      readQuickJSScriptDefinitionSync(scriptSource(`plot.Line(close[0], { id: 'x' })`))
        .indicatorType,
    ).toBeUndefined()
  })

  it('调用类型优先于 plots 声明并保留公共样式', async () => {
    const result = await runQuickJSScript({
      source: `defineIndicator({
        name: 'Override', inputs: {},
        plots: [{ id: 'shape', kind: 'line', label: 'Shape', offset: 1 }],
        onBar() { plot.Histogram(close[0], { id: 'shape' }) }
      })`,
      bars: barsFromCloses([2, 4]),
    })
    expect(result.plots[0]).toMatchObject({
      kind: 'histogram',
      label: 'Shape',
      offset: 1,
      baseline: 0,
    })
  })

  it('拒绝同一 Plot 在运行中改变类型', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(
          `(close[0] === 2 ? plot.Line : plot.Point)(close[0], { id: 'shape' })`,
        ),
        bars: barsFromCloses([2, 4]),
      }),
    ).rejects.toThrow('cannot change kind')
  })

  it.each([
    `plot.Unknown(close[0], { id: 'shape' })`,
    `plot(PlotKind.Line, close[0], { id: 'shape' })`,
  ])('拒绝未知方法和已移除的函数调用：%s', async (call) => {
    await expect(
      runQuickJSScript({
        source: scriptSource(call),
        bars: barsFromCloses([2]),
      }),
    ).rejects.toThrow('not a function')
  })

  it('逐 bar 计算 ta.sma，历史不足时输出空位', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot.Line(ta.sma(close, params.period)[0], { id: 'ma' })`,
        `{ period: input(3, { title: '周期' }) }`,
      ),
      bars: barsFromCloses([10, 20, 30, 40]),
    })
    expect(values(result, 'ma')).toEqual([undefined, undefined, 20, 30])
  })

  it('ta.wma 按 1..length 权重加权，完整窗口之前保留 NaN', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.wma(close, 3)[0], { id: 'wma' })`),
      bars: barsFromCloses([1, 2, 3, 4]),
    })
    expect(values(result, 'wma')).toEqual([undefined, undefined, 14 / 6, 20 / 6])
  })

  it('ta.vwma 按成交量加权，窗口成交量之和为 0 时留空', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.vwma(close, volume, 2)[0], { id: 'vwma' })`),
      bars: barsFromCloses([10, 20, 30], [0, 0, 2]),
    })
    expect(values(result, 'vwma')).toEqual([undefined, undefined, 30])
  })

  it('ta.sum 对窗口求和，完整窗口之前保留空位', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.sum(close, 3)[0], { id: 'sum' })`),
      bars: barsFromCloses([1, 2, 3, 4, 5]),
    })
    expect(values(result, 'sum')).toEqual([undefined, undefined, 6, 9, 12])
  })

  it('ta.stddev 计算总体标准差，完整窗口之前保留空位', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.stddev(close, 3)[0], { id: 'sd' })`),
      bars: barsFromCloses([2, 4, 6, 8]),
    })
    // 窗口 [2,4,6] 均值 4，偏差平方和 8，总体标准差 sqrt(8/3)。
    expect(values(result, 'sd')?.[2]).toBeCloseTo(Math.sqrt(8 / 3), 12)
    expect(values(result, 'sd')?.[3]).toBeCloseTo(Math.sqrt(8 / 3), 12)
  })

  it('ta.mom 取相对 length 根之前的差值，历史不足保留空位', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.mom(close, 2)[0], { id: 'mom' })
plot.Line(ta.mom(close)[0], { id: 'step' })`),
      bars: barsFromCloses([1, 2, 4, 7]),
    })
    expect(values(result, 'mom')).toEqual([undefined, undefined, 3, 5])
    expect(values(result, 'step')).toEqual([undefined, 1, 2, 3])
  })

  it('ta.roc 取百分比变化，基准为 0 时留空', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.roc(close, 1)[0], { id: 'roc' })`),
      bars: barsFromCloses([1, 2, 4, 0, 5]),
    })
    expect(values(result, 'roc')).toEqual([undefined, 100, 100, -100, undefined])
  })

  // 逐 bar 重新调用窗口/统计函数必须复用同一派生序列，否则退化为平方级并触发时间上限。
  it.each([
    ['sum', `ta.sum(close, 20)[0]`],
    ['stddev', `ta.stddev(close, 20)[0]`],
  ])('ta.%s 在长序列上保持线性，不触发时间上限', async (id, expression) => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(${expression}, { id: '${id}' })`),
      bars: barsFromCloses(wavyCloses(2000)),
    })
    expect(Number.isFinite(values(result, id)?.at(-1))).toBe(true)
  })

  it('长序列下 ta.stddev 结果与独立参考实现一致', async () => {
    const closes = wavyCloses(2000)
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.stddev(close, 20)[0], { id: 'sd' })`),
      bars: barsFromCloses(closes),
    })
    const actual = values(result, 'sd')
    const expected = referenceStddev(closes, 20)
    expect(actual).toHaveLength(closes.length)
    for (let index = 0; index < closes.length; index++) {
      const expectedValue = expected[index] ?? Number.NaN
      if (Number.isNaN(expectedValue)) expect(actual?.[index]).toBeUndefined()
      else expect(actual?.[index]).toBeCloseTo(expectedValue, 9)
    }
  })

  it.each([0, -1, 1.5])('ta.sum 拒绝非法窗口 %s', async (length) => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot.Line(ta.sum(close, ${length})[0], { id: 'sum' })`),
        bars: barsFromCloses([1, 2, 3]),
      }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
  })

  it('序列支持历史偏移，params 作为全局注入', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot.Line(close[0] * params.factor, { id: 'scaled' })
plot.Line(close[1], { id: 'prev' })`,
        `{ factor: input(1) }`,
      ),
      bars: barsFromCloses([2, 4, 6]),
      params: { factor: 10 },
    })
    expect(values(result, 'scaled')).toEqual([20, 40, 60])
    expect(values(result, 'prev')).toEqual([undefined, 2, 4])
  })

  it('编译错误与无穷大输出分别抛出可诊断错误', async () => {
    await expect(
      runQuickJSScript({ source: `plot(`, bars: barsFromCloses([1]) }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot.Line(1 / 0, { id: 'bad' })`),
        bars: barsFromCloses([1]),
      }),
    ).rejects.toBeInstanceOf(ScriptPlotError)
  })

  it('两次运行互不影响，序列状态各自独立', async () => {
    const source = scriptSource(`plot.Line(ta.sma(close, 2)[0], { id: 'ma' })`)
    const first = await runQuickJSScript({ source, bars: barsFromCloses([10, 20, 30]) })
    const second = await runQuickJSScript({ source, bars: barsFromCloses([100, 200, 300]) })
    expect(values(first, 'ma')).toEqual([undefined, 15, 25])
    expect(values(second, 'ma')).toEqual([undefined, 150, 250])
  })

  it('整文件只初始化一次，初始化时创建的派生序列跨 bar 正确缓存', async () => {
    const source = `
      const average = ta.sma(close, 2)
      let calls = 0
      defineIndicator({ name: 'PersistentSeries', pane: 'sub', inputs: {}, onBar() {
        if (globalThis.close !== close || globalThis.ta !== ta) throw new Error('全局对象不一致')
        plot.Line(average[0], { id: 'ma' })
        plot.Line(++calls, { id: 'calls' })
      } })`
    const result = await runQuickJSScript({ source, bars: barsFromCloses([10, 20, 30, 40]) })
    expect(values(result, 'ma')).toEqual([undefined, 15, 25, 35])
    expect(values(result, 'calls')).toEqual([1, 2, 3, 4])
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({
      name: 'PersistentSeries',
      pane: 'sub',
      inputs: {},
    })
  })

  it('用户库与内置库走同一 defineLibrary 协议', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(stats.mid(open, close), { id: 'mid' })`),
      bars: barsFromCloses([10, 20]),
      libraries: [
        { name: 'stats', source: `defineLibrary('stats', { mid: (a, b) => (a[0] + b[0]) / 2 })` },
      ],
    })
    expect(values(result, 'mid')).toEqual([10, 20])
  })

  it('库名与已有全局冲突时拒绝加载', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot.Line(close[0], { id: 'close' })`),
        bars: barsFromCloses([1]),
        libraries: [{ name: 'close', source: `defineLibrary('close', {})` }],
      }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
  })

  it('失控脚本被时间上限中断，不挂住执行', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`while (true) {}`),
        bars: barsFromCloses([1]),
      }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
  })

  it('字符串输入的 options 随声明保存，供参数面板渲染下拉', () => {
    const definition = readQuickJSScriptDefinitionSync(
      `defineIndicator({ name: 'OptionScript', inputs: {
        type: input('SMA', { title: '算法', options: ['SMA', 'EMA'] }),
      }, onBar() {} })`,
    )
    expect(definition.inputs).toEqual({
      type: { default: 'SMA', title: '算法', options: ['SMA', 'EMA'] },
    })
  })

  it.each([
    `plot.Line(1, { id: 'x' })`,
    `defineIndicator({ name: 'Bad', pane: 'side', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', indicatorType: 'unknown-type', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input(Infinity) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input(2, { options: ['a'] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input('a', { options: [] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input('a', { options: [1] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: {}, onBar() {} }); defineIndicator({})`,
  ])('拒绝不完整或错误声明：%s', async (source) => {
    await expect(runQuickJSScript({ source, bars: [] })).rejects.toBeInstanceOf(
      ScriptExecutionError,
    )
  })
})

describe('随包 SMA 示例脚本', () => {
  it('声明业务分类、周期参数与算法下拉', () => {
    const definition = readQuickJSScriptDefinitionSync(shippedSmaSource)
    expect(definition.indicatorType).toBe('moving-average')
    expect(definition.inputs).toEqual({
      period: { default: 20, title: '周期' },
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
      bars: barsFromCloses([1, 2, 3, 4], [1, 2, 3, 4]),
      params: { period: 3, type },
    })
    expect(values(result, 'sma')).toEqual(expected)
  })

  // 逐 bar 重新调用 ta.* 必须复用派生序列与窗口累计状态，避免重复扫描历史。
  it.each(['SMA', 'EMA', 'WMA', 'VWMA'])(
    '算法 %s 在长序列上保持线性，不触发时间上限',
    async (type) => {
      const result = await runQuickJSScript({
        source: shippedSmaSource,
        bars: barsFromCloses(wavyCloses(2000)),
        params: { period: 20, type },
      })
      expect(Number.isFinite(values(result, 'sma')?.at(-1))).toBe(true)
    },
  )

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

  it('ta.rsi 在长序列上复用派生序列，不触发时间上限', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(ta.rsi(close, 14)[0], { id: 'rsi' })`),
      bars: barsFromCloses(wavyCloses(2000)),
    })
    expect(Number.isFinite(values(result, 'rsi')?.at(-1))).toBe(true)
  })
})
