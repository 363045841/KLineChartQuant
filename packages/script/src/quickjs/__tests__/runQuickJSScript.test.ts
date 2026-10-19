/** 验证 QuickJS 脚本执行器：全局序列、ta、params、错误、运行隔离与随包示例脚本。 */
import { readdirSync, readFileSync } from 'node:fs'
import { Color } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import {
  barsFromCloses,
  scriptSource,
  shippedSource,
  values,
  wavyCloses,
} from '../../__tests__/marketData.js'
import type { Bar } from '../../contracts/input.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { builtinScriptSources } from '../generated/builtinScripts.js'
import { readQuickJSScriptDefinitionSync, runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 随包发布的 SMA 示例源码；直接读磁盘，避免测试里复制一份脚本。 */
const shippedSmaSource = shippedSource('sma')
/** 直接执行发布的 Shape 示例，验证全部形状声明和实际逐 bar 输出。 */
const shippedShapeSource = shippedSource('shape')
/** 直接执行 OC Average 源码，验证参数和距离信号。 */
const shippedOcSource = shippedSource('open-close-average')

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
  return row.closes.map((close, index) => ({
    time: index,
    open: close,
    high: row.highs[index] ?? close,
    low: row.lows[index] ?? close,
    close,
    volume: 1,
  }))
}

/** 标记类图形的一行用例：声明片段与逐 bar 期望输出。 */
interface MarkerCase {
  readonly name: string
  /** onBar 中的绘图声明。 */
  readonly body: string
  readonly bars: readonly number[]
  /** 图形自身属性，按 toMatchObject 比对。 */
  readonly shape: Readonly<Record<string, unknown>>
  /** 逐 bar 期望点，undefined 表示该 bar 无点。 */
  readonly data: readonly (Readonly<Record<string, unknown>> | undefined)[]
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
          defineIndicator({ name: 'WindowReads', position: Position.Sub, inputs: {}, onBar() {
            plot.Line(ta.${algorithm}(prices, ${algorithm === 'vwma' ? 'volumes, ' : ''}1000)[0], 'value')
            plot.Line(reads, 'reads')
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
          plot.${kind}(close[0], 'signal')
          if (close[0] === 2) plot.${kind}(null, 'signal')
          if (close[0] === 3) plot.${kind}(NaN, 'signal')
          plot.${kind}(null, 'empty')
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

  it('Char 和 Arrow 使用共享默认值，调用只需提供 name', async () => {
    const result = await runQuickJSScript({
      source: `defineIndicator({
        name: 'Marker defaults', position: Position.Sub, inputs: {},
        onBar() {
          plot.Char(true, 'char')
          plot.Arrow(close[0], 'arrow', { colorUp: 'green', colorDown: 'red' })
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

  // 四种图形的逐 bar 颜色/文字色与布尔条件只差字面量，统一走同一条 PlotCollector 通道。
  it.each<MarkerCase>([
    {
      name: 'Char 支持布尔条件、Unicode 字符和逐 bar 颜色',
      body: `plot.Char(close[0] > 1, 'signal', {
        char: '🠅', location: ShapeLocation.BelowBar,
        color: close[0] > 2 ? 'red' : 'blue', text: '买入'
      })`,
      bars: [1, 2, 3],
      shape: { kind: 'char', char: '🠅', location: 'belowbar', text: '买入' },
      data: [undefined, { value: 1, color: 'blue' }, { value: 1, color: 'red' }],
    },
    {
      name: 'Arrow 保留有符号数值并采集逐 bar 方向颜色',
      body: `plot.Arrow(close[0], 'signal', {
        colorUp: close[0] > 1 ? 'green' : 'blue', colorDown: 'red',
        size: ShapeSize.Large
      })`,
      bars: [1, -2, 0, 10],
      shape: { kind: 'arrow', size: 'large' },
      data: [
        { value: 1, color: 'blue' },
        { value: -2, color: 'red' },
        { value: 0, color: 'red' },
        { value: 10, color: 'green' },
      ],
    },
    {
      name: 'Shape 数值输出直接配置样式，形状和文字颜色可逐 bar 改变',
      body: `plot.Shape(close[0], 'signal', {
        style: ShapeStyle.LabelUp, location: ShapeLocation.Absolute,
        size: ShapeSize.Small, text: '信号', offset: 1,
        color: close[0] === 2 ? 'red' : 'green', textColor: close[0] === 2 ? 'blue' : 'red',
      })`,
      bars: [2, 4],
      shape: {
        kind: 'shape',
        style: 'labelup',
        location: 'absolute',
        size: 'small',
        text: '信号',
        offset: 1,
      },
      data: [
        { value: 2, color: 'red', textColor: 'blue' },
        { value: 4, color: 'green', textColor: 'red' },
      ],
    },
    {
      name: 'Shape 布尔条件贯通同一个 PlotCollector',
      body: `plot.Shape(close[0] > 2, 'signal', {
        style: ShapeStyle.LabelUp, location: ShapeLocation.BelowBar,
        size: ShapeSize.Small, text: '买入', offset: 1,
        color: 'red', textColor: 'blue',
      })`,
      bars: [2, 4],
      shape: {
        kind: 'shape',
        style: 'labelup',
        location: 'belowbar',
        size: 'small',
        text: '买入',
        offset: 1,
      },
      data: [undefined, { value: 1, color: 'red', textColor: 'blue' }],
    },
  ])('$name', async ({ body, bars, shape, data }) => {
    const result = await runQuickJSScript({
      source: scriptSource(body),
      bars: barsFromCloses(bars),
    })
    expect(result.plots[0]).toMatchObject(shape)
    expect(result.plots[0]?.data).toEqual(data)
  })

  it.each([
    `plot.Arrow(true, 'bad')`,
    `plot.Point(1, 'bad', { size: 'gigantic' })`,
    `plot.Char(true, 'bad', { char: 'AB' })`,
    `plot.Char(true, 'bad', { char: close[0] > 1 ? 'A' : 'B' })`,
  ])('拒绝无效参数或整轮变化的字符：%s', async (body) => {
    await expect(
      runQuickJSScript({ source: scriptSource(body), bars: barsFromCloses([1, 2]) }),
    ).rejects.toThrow()
  })

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

  it('同一 name 不允许逐 bar 改变整列形状样式', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(
          `plot.Shape(true, 'signal', { style: close[0] === 2 ? ShapeStyle.Circle : ShapeStyle.Square })`,
        ),
        bars: barsFromCloses([2, 4]),
      }),
    ).rejects.toThrow('cannot change style')
  })

  it('发布的 Shape Gallery 在 12 根行情上依次输出全部形状', async () => {
    const result = await runQuickJSScript({
      source: shippedShapeSource,
      bars: barsFromCloses(wavyCloses(12)),
    })
    expect(result.plots).toHaveLength(12)
    for (const [index, plot] of result.plots.entries()) {
      expect(plot.kind).toBe('shape')
      if (plot.kind !== 'shape') throw new Error('Expected Shape Plot')
      expect(plot.data.filter((point) => point?.value === 1)).toHaveLength(1)
      expect(plot.data[index]?.value).toBe(1)
    }
  })

  it('Shape 的数值 0 保留在数据列中', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Shape(close[0] - 2, 'signal', { location: ShapeLocation.Top })`),
      bars: barsFromCloses([2, 4]),
    })
    expect(values(result, 'signal')).toEqual([0, 2])
  })

  it('Shape 缺省样式为 xcross/abovebar/auto', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Shape(true, 'signal')`),
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
    'Shape 调用拒绝无效字段 %s',
    async (field) => {
      await expect(
        runQuickJSScript({
          source: scriptSource(`plot.Shape(true, 'bad', { ${field} })`),
          bars: barsFromCloses([2]),
        }),
      ).rejects.toThrow('无效 plot 调用参数')
    },
  )

  it('相对 Shape 不能作为 fill 的价格边界', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(
          `const signal = plot.Shape(true, 'signal'); const price = plot.Line(close[0], 'price'); fill(signal, price, Color.Teal)`,
        ),
        bars: barsFromCloses([2]),
      }),
    ).rejects.toThrow('requires price-positioned plots')
  })

  it('fill 用句柄引用边界，每根 bar 保存颜色或 null', async () => {
    const result = await runQuickJSScript({
      source: `defineIndicator({ name: 'Cloud', position: Position.Sub, inputs: {},
        onBar() {
          const fast = plot.Line(close[0], 'fast')
          const slow = plot.Line(close[0] + 1, 'slow')
          fill(fast, slow, close[0] === 2 ? Color.Teal : close[0] === 4 ? null : Color.Red, '快慢云')
        } })`,
      bars: barsFromCloses([2, 4, 6]),
    })
    expect(result.fills).toEqual([
      {
        id: '快慢云',
        from: 'fast',
        to: 'slow',
        visible: true,
        colors: [Color.Teal, null, Color.Red],
      },
    ])
  })

  it('fill 条件调用的空 bar 不延续旧颜色，同一边界的不同 title 各自保存颜色', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        const a = plot.Line(close[0], 'a')
        const b = plot.Line(close[0] + 1, 'b')
        if (close[0] !== 4) fill(a, b, '#00897b26', 'cloud')
        fill(a, b, Color.Red, 'second', { visible: false })
      `),
      bars: barsFromCloses([2, 4, 6]),
    })
    expect(result.fills).toEqual([
      { id: 'cloud', from: 'a', to: 'b', visible: true, colors: ['#00897b26', null, '#00897b26'] },
      {
        id: 'second',
        from: 'a',
        to: 'b',
        visible: false,
        colors: [Color.Red, Color.Red, Color.Red],
      },
    ])
  })

  it('fill 缺省标识按 from/to 生成', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `const a = plot.Line(close[0], 'a'); const b = plot.Point(close[0], 'b'); fill(a, b, Color.Teal)`,
      ),
      bars: barsFromCloses([2]),
    })
    expect(result.fills[0]?.id).toBe('a-b')
  })

  it.each([
    [
      `const a = plot.Line(close[0], 'a'); fill(a, { name: 'ghost' }, Color.Teal)`,
      'Unknown fill source',
    ],
    [
      `const a = plot.Line(close[0], 'a'); const b = plot.Line(close[0], 'b'); fill(a, b, 42)`,
      '无效 fill 调用参数',
    ],
  ])('fill 拒绝无效的边界引用或样式：%s', async (body, message) => {
    await expect(
      runQuickJSScript({ source: scriptSource(body), bars: barsFromCloses([2]) }),
    ).rejects.toThrow(message)
  })

  it('globalThis.plot 与裸 plot 同一，成员与契约一一对应', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
         if (plot !== globalThis.plot) throw new Error('绘图全局不一致')
         globalThis.plot.Line(close[0], 'line')
         globalThis.plot.Histogram(close[0], 'histogram')
         globalThis.plot.Point(close[0], 'points')
         globalThis.plot.Shape(true, 'shape')
         globalThis.plot.Char(true, 'char')
         globalThis.plot.Arrow(close[0], 'arrow')
      `),
      bars: barsFromCloses([2, 4]),
    })
    expect(values(result, 'line')).toEqual([2, 4])
    expect(result.plots.map((plot) => [plot.id, plot.kind])).toEqual([
      ['line', 'line'],
      ['histogram', 'histogram'],
      ['points', 'points'],
      ['shape', 'shape'],
      ['char', 'char'],
      ['arrow', 'arrow'],
    ])
  })

  it.each([
    ['Main', 'main'],
    ['Sub', 'sub'],
  ])('从 QuickJS Global 读取 Position.%s 作为指标注册位置', (member, expected) => {
    const source = `defineIndicator({ name: 'PositionEnum', position: globalThis.Position.${member}, inputs: {}, onBar() {
      if (Position !== globalThis.Position) throw new Error('枚举全局不一致')
    } })`
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({ position: expected })
  })

  it('Color 常用色枚举在 VM 中与共享契约逐项一致，取值可直接作为绘图颜色', async () => {
    // 成员表由契约生成，用例只比对色值，不复制一份调色板。
    const checks = Object.entries(Color)
      .map(
        ([member, value]) =>
          `if (Color.${member} !== ${JSON.stringify(value)}) throw new Error('Color.${member} 与契约不一致')`,
      )
      .join('\n')
    const result = await runQuickJSScript({
      source: `defineIndicator({ name: 'ColorEnum', position: Position.Sub, inputs: {}, onBar() {
        ${checks}
        plot.Line(close[0], 'line', { color: Color.Teal })
      } })`,
      bars: barsFromCloses([2, 4]),
    })
    expect(values(result, 'line')).toEqual([2, 4])
    expect(result.plots[0]?.data.map((point) => point?.color)).toEqual([Color.Teal, Color.Teal])
  })

  it('拒绝同一 Plot 在运行中改变类型', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`(close[0] === 2 ? plot.Line : plot.Point)(close[0], 'shape')`),
        bars: barsFromCloses([2, 4]),
      }),
    ).rejects.toThrow('cannot change kind')
  })

  it.each([`plot.Unknown(close[0], 'shape')`, `plot(PlotKind.Line, close[0], 'shape')`])(
    '拒绝未知方法和已移除的函数调用：%s',
    async (call) => {
      await expect(
        runQuickJSScript({
          source: scriptSource(call),
          bars: barsFromCloses([2]),
        }),
      ).rejects.toThrow('not a function')
    },
  )

  it('Columns 和 Histogram 保留不同柱宽契约', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        plot.Columns(close, 'columns', { baseline: -1 })
        plot.Histogram(close, 'pixels', { size: 5, baseline: 2 })
        plot.Histogram(close, 'enum', { size: ShapeSize.Large })
        plot.Histogram(close, 'default')`),
      bars: barsFromCloses([1, 3]),
    })
    expect(result.plots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'columns', kind: 'columns', baseline: -1 }),
        expect.objectContaining({ id: 'pixels', kind: 'histogram', size: 5, baseline: 2 }),
        expect.objectContaining({ id: 'enum', size: 'large' }),
        expect.objectContaining({ id: 'default', size: 'auto' }),
      ]),
    )
  })

  it.each([
    'plot.Columns(close, "x", { size: ShapeSize.Normal })',
    ...['0', '-1', 'NaN', 'Infinity', '"invalid"'].map(
      (size) => `plot.Histogram(close, 'x', { size: ${size} })`,
    ),
  ])('拒绝无效柱宽：%s', async (call) => {
    await expect(
      runQuickJSScript({
        source: scriptSource(call),
        bars: barsFromCloses([1]),
      }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
  })

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

  // 历史偏移已由 Series 用例覆盖，这里只锁定宿主参数驱动缩放与 ta 窗口。
  it('输入参数从宿主读取并驱动缩放与 ta 窗口', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`
        const factor = input.float(1)
        const period = input.int(3, { title: '周期' })
        plot.Line(close[0] * factor, 'scaled')
        plot.Line(ta.sma(close, period)[0], 'ma')`),
      bars: barsFromCloses([10, 20, 30, 40]),
      params: { factor: 10 },
    })
    expect(values(result, 'scaled')).toEqual([100, 200, 300, 400])
    expect(values(result, 'ma')).toEqual([undefined, undefined, 20, 30])
  })

  it('编译错误抛出执行错误', async () => {
    await expect(
      runQuickJSScript({ source: `plot(`, bars: barsFromCloses([1]) }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
  })

  it('无穷大输出抛出绘图错误', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot.Line(1 / 0, 'bad')`),
        bars: barsFromCloses([1]),
      }),
    ).rejects.toBeInstanceOf(ScriptPlotError)
  })

  it('两次运行互不影响，序列状态各自独立', async () => {
    const source = scriptSource(`plot.Line(ta.sma(close, 2)[0], 'ma')`)
    const first = await runQuickJSScript({ source, bars: barsFromCloses([10, 20, 30]) })
    const second = await runQuickJSScript({ source, bars: barsFromCloses([100, 200, 300]) })
    expect(values(first, 'ma')).toEqual([undefined, 15, 25])
    expect(values(second, 'ma')).toEqual([undefined, 150, 250])
  })

  it('整文件只初始化一次，初始化时创建的派生序列跨 bar 正确缓存', async () => {
    const source = `
      const average = ta.sma(close, 2)
      let calls = 0
      defineIndicator({ name: 'PersistentSeries', position: 'sub', inputs: {}, onBar() {
        if (globalThis.close !== close || globalThis.ta !== ta) throw new Error('全局对象不一致')
        plot.Line(average[0], 'ma')
        plot.Line(++calls, 'calls')
      } })`
    const result = await runQuickJSScript({ source, bars: barsFromCloses([10, 20, 30, 40]) })
    expect(values(result, 'ma')).toEqual([undefined, 15, 25, 35])
    expect(values(result, 'calls')).toEqual([1, 2, 3, 4])
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({
      name: 'PersistentSeries',
      position: 'sub',
      inputs: {},
    })
  })

  it('用户库与内置库走同一 defineLibrary 协议', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(stats.mid(open, close), 'mid')`),
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
        source: scriptSource(`plot.Line(close[0], 'close')`),
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
      `defineIndicator({ name: 'OptionScript', position: Position.Sub, onBar() {
        const type = input.string('SMA', { title: '算法', options: ['SMA', 'EMA'] })
      } })`,
    )
    expect(definition.inputs).toEqual({
      type: { default: 'SMA', title: '算法', options: ['SMA', 'EMA'] },
    })
  })

  it('周期输入接受 Timeframe 成员并保存声明', () => {
    const definition = readQuickJSScriptDefinitionSync(
      `defineIndicator({ name: 'TimeframeScript', position: Position.Sub, onBar() {
        const timeframe = input.timeframe(Timeframe.Day, {
          title: '目标周期',
          options: [Timeframe.Hour1, Timeframe.Day],
        })
        plot.Line(ta.sma(close, 2)[0], timeframe)
      } })`,
    )
    expect(definition.inputs).toEqual({
      timeframe: { default: 'D', title: '目标周期', options: ['60', 'D'] },
    })
  })

  it.each([
    `plot.Line(1, 'x')`,
    `defineIndicator({ name: 'MissingPosition', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', position: 'side', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.float(Infinity) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.int(2.5) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.string('a', { options: [] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input.string('a', { options: [1] }) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { timeframe: input.timeframe('2h') }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { timeframe: input.timeframe('D', { options: ['60'] }) }, onBar() {} })`,
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
      source: scriptSource(`plot.Line(ta.rsi(close, 14)[0], 'rsi')`),
      bars: barsFromCloses(wavyCloses(2000)),
    })
    expect(Number.isFinite(values(result, 'rsi')?.at(-1))).toBe(true)
  })
})
