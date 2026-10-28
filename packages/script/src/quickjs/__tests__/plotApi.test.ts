/** 验证 plot 调用契约：空值语义、标记图形、fill 与整列样式约束。 */
import { Color } from '@363045841yyt/klinechart-plot-contracts'
import { describe, expect, it } from 'vitest'
import { barsFromCloses, requireValues, scriptSource } from '../../__tests__/marketData.js'
import { ScriptExecutionError } from '../../errors.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

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

describe('plot 调用契约', () => {
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
      expect(requireValues(result, 'signal')).toEqual([1, undefined, undefined, 4])
      expect(requireValues(result, 'empty')).toEqual([undefined, undefined, undefined, undefined])
    },
  )

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

  it('Shape 的数值 0 保留在数据列中', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Shape(close[0] - 2, 'signal', { location: ShapeLocation.Top })`),
      bars: barsFromCloses([2, 4]),
    })
    expect(requireValues(result, 'signal')).toEqual([0, 2])
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

  it('globalThis.plot 与裸 plot 指向同一对象', async () => {
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
    expect(requireValues(result, 'line')).toEqual([2, 4])
    expect(result.plots.map((plot) => [plot.id, plot.kind])).toEqual([
      ['line', 'line'],
      ['histogram', 'histogram'],
      ['points', 'points'],
      ['shape', 'shape'],
      ['char', 'char'],
      ['arrow', 'arrow'],
    ])
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

  it('hline 在文件顶层声明，输出不占数据列的图表级水平线', async () => {
    const result = await runQuickJSScript({
      source: `hline(80, { color: Color.Gray, linestyle: HLineStyle.style_dashed, linewidth: 2 })
hline(20)
${scriptSource('')}`,
      bars: barsFromCloses([2, 4]),
    })
    expect(result.hlines).toEqual([
      { id: '0', price: 80, color: Color.Gray, dash: [4, 4], width: 2 },
      { id: '1', price: 20, color: Color.Blue, dash: [], width: 1 },
    ])
    expect(result.plots).toEqual([])
  })

  it('两条 hline 之间可以声明整幅带状填充', async () => {
    const result = await runQuickJSScript({
      source: `const over = hline(80, { color: Color.Gray, linestyle: HLineStyle.style_dashed })
const under = hline(20, { color: Color.Gray, linestyle: HLineStyle.style_dashed })
fill(over, under, '#26a69a26', 'zone')
${scriptSource('')}`,
      bars: barsFromCloses([2, 4]),
    })
    expect(result.hlineFills).toEqual([
      { id: 'zone', from: '0', to: '1', color: '#26a69a26', visible: true },
    ])
  })

  it('hline 填充同样只在文件顶层声明，混合句柄与未知引用都拒绝', async () => {
    await expect(
      runQuickJSScript({
        source: `const over = hline(80)
const under = hline(20)
defineIndicator({ name: 'Bad', position: 'sub', onBar() { fill(over, under, '#fff') } })`,
        bars: barsFromCloses([1]),
      }),
    ).rejects.toThrow('文件顶层')
    await expect(
      runQuickJSScript({
        source: `${scriptSource(`fill({ name: 'a' }, { hline: '0' }, '#fff')`)}`,
        bars: barsFromCloses([1]),
      }),
    ).rejects.toThrow('无效 fill 调用参数')
    await expect(
      runQuickJSScript({
        source: `fill({ hline: '9' }, { hline: '8' }, '#fff')\n${scriptSource('')}`,
        bars: barsFromCloses([1]),
      }),
    ).rejects.toThrow('Unknown hline fill source')
  })

  it('hline 只能在文件顶层声明，非法参数与 onBar 内调用都拒绝', async () => {
    await expect(
      runQuickJSScript({ source: scriptSource(`hline(80)`), bars: barsFromCloses([1]) }),
    ).rejects.toThrow('文件顶层')
    for (const call of [
      'hline(NaN)',
      'hline(1, { linewidth: 0 })',
      'hline(1, { linewidth: Infinity })',
      'hline(1, { linestyle: "wavy" })',
      'hline(1, { color: 1 })',
      'hline(1, { title: 1 })',
      'hline(1, { unknown: true })',
    ]) {
      await expect(
        runQuickJSScript({ source: `${call}\n${scriptSource('')}`, bars: barsFromCloses([1]) }),
      ).rejects.toThrow()
    }
  })
})
