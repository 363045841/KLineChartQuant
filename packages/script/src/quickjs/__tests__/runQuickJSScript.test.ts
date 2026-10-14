/** 验证 QuickJS 脚本执行器：全局序列、ta、params、错误、运行隔离与随包示例脚本。 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Bar } from '../../contracts/input.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { readQuickJSScriptDefinitionSync, runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 随包发布的 SMA 示例源码；直接读磁盘，避免测试里复制一份脚本。 */
const shippedSmaSource = readFileSync(new URL('../../../scripts/sma.js', import.meta.url), 'utf8')

/** 用完整文件声明包装计算片段，所有用例走相同初始化入口。 */
function scriptSource(body: string, inputs = '{}'): string {
  return `defineIndicator({ name: 'TestScript', pane: 'main', inputs: ${inputs}, onBar() { ${body} } })`
}

/** 生成 close 驱动的完整 K 线，open/high/low 与 close 相同；volume 缺省为 1。 */
function barsFromCloses(closes: readonly number[], volumes?: readonly number[]): Bar[] {
  return closes.map((close, index) => ({
    time: index,
    open: close,
    high: close,
    low: close,
    close,
    volume: volumes?.[index] ?? 1,
  }))
}

/** 取某 id 的值序列，缺失点为 undefined。 */
function values(options: Awaited<ReturnType<typeof runQuickJSScript>>, id: string) {
  return options.plots.find((plot) => plot.id === id)?.data.map((point) => point?.value)
}

/** 生成平滑波动的收盘价，避免常量序列让各算法退化。 */
function wavyCloses(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 100 + Math.sin(index / 7) * 5)
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

describe('runQuickJSScript', () => {
  it.each(['Line', 'Histogram', 'Points'])(
    '从 QuickJS Global 读取 PlotKind.%s 并生成对应图形',
    async (member) => {
      const result = await runQuickJSScript({
        source: scriptSource(`
        if (PlotKind !== globalThis.PlotKind) throw new Error('枚举全局不一致')
        plot(globalThis.PlotKind.${member}, close[0], { id: 'shape' })
      `),
        bars: barsFromCloses([2, 4]),
      })
      expect(result.plots[0]?.kind).toBe(member.toLowerCase())
      expect(values(result, 'shape')).toEqual([2, 4])
    },
  )

  it.each([
    ['Main', 'main'],
    ['Sub', 'sub'],
  ])('从 QuickJS Global 读取 PaneKind.%s 作为指标注册位置', (member, expected) => {
    const source = `defineIndicator({ name: 'PaneEnum', pane: globalThis.PaneKind.${member}, inputs: {}, onBar() {
      if (PaneKind !== globalThis.PaneKind) throw new Error('枚举全局不一致')
    } })`
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({ pane: expected })
  })

  it('调用类型优先于 plots 声明并保留公共样式', async () => {
    const result = await runQuickJSScript({
      source: `defineIndicator({
        name: 'Override', inputs: {},
        plots: [{ id: 'shape', kind: 'line', label: 'Shape', offset: 1 }],
        onBar() { plot(PlotKind.Histogram, close[0], { id: 'shape' }) }
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
          `plot(close[0] === 2 ? PlotKind.Line : PlotKind.Points, close[0], { id: 'shape' })`,
        ),
        bars: barsFromCloses([2, 4]),
      }),
    ).rejects.toThrow('cannot change kind')
  })

  it('拒绝未知绘图类型', async () => {
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot('unknown', close[0], { id: 'shape' })`),
        bars: barsFromCloses([2]),
      }),
    ).rejects.toThrow('plot kind')
  })

  it('逐 bar 计算 ta.sma，历史不足保留 NaN', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot(PlotKind.Line, ta.sma(close, params.period)[0], { id: 'ma' })`,
        `{ period: input(3, { title: '周期' }) }`,
      ),
      bars: barsFromCloses([10, 20, 30, 40]),
    })
    expect(values(result, 'ma')).toEqual([NaN, NaN, 20, 30])
  })

  it('ta.wma 按 1..length 权重加权，完整窗口之前保留 NaN', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot(PlotKind.Line, ta.wma(close, 3)[0], { id: 'wma' })`),
      bars: barsFromCloses([1, 2, 3, 4]),
    })
    expect(values(result, 'wma')).toEqual([NaN, NaN, 14 / 6, 20 / 6])
  })

  it('ta.vwma 按成交量加权，窗口成交量之和为 0 时留空', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot(PlotKind.Line, ta.vwma(close, volume, 2)[0], { id: 'vwma' })`),
      bars: barsFromCloses([10, 20, 30], [0, 0, 2]),
    })
    expect(values(result, 'vwma')).toEqual([NaN, NaN, 30])
  })

  it('序列支持历史偏移，params 作为全局注入', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot(PlotKind.Line, close[0] * params.factor, { id: 'scaled' })
plot(PlotKind.Line, close[1], { id: 'prev' })`,
        `{ factor: input(1) }`,
      ),
      bars: barsFromCloses([2, 4, 6]),
      params: { factor: 10 },
    })
    expect(values(result, 'scaled')).toEqual([20, 40, 60])
    expect(values(result, 'prev')).toEqual([NaN, 2, 4])
  })

  it('编译错误与无穷大输出分别抛出可诊断错误', async () => {
    await expect(
      runQuickJSScript({ source: `plot(`, bars: barsFromCloses([1]) }),
    ).rejects.toBeInstanceOf(ScriptExecutionError)
    await expect(
      runQuickJSScript({
        source: scriptSource(`plot(PlotKind.Line, 1 / 0, { id: 'bad' })`),
        bars: barsFromCloses([1]),
      }),
    ).rejects.toBeInstanceOf(ScriptPlotError)
  })

  it('两次运行互不影响，序列状态各自独立', async () => {
    const source = scriptSource(`plot(PlotKind.Line, ta.sma(close, 2)[0], { id: 'ma' })`)
    const first = await runQuickJSScript({ source, bars: barsFromCloses([10, 20, 30]) })
    const second = await runQuickJSScript({ source, bars: barsFromCloses([100, 200, 300]) })
    expect(values(first, 'ma')).toEqual([NaN, 15, 25])
    expect(values(second, 'ma')).toEqual([NaN, 150, 250])
  })

  it('整文件只初始化一次，初始化时创建的派生序列跨 bar 正确缓存', async () => {
    const source = `
      const average = ta.sma(close, 2)
      let calls = 0
      defineIndicator({ name: 'PersistentSeries', pane: 'sub', inputs: {}, onBar() {
        if (globalThis.close !== close || globalThis.ta !== ta) throw new Error('全局对象不一致')
        plot(PlotKind.Line, average[0], { id: 'ma' })
        plot(PlotKind.Line, ++calls, { id: 'calls' })
      } })`
    const result = await runQuickJSScript({ source, bars: barsFromCloses([10, 20, 30, 40]) })
    expect(values(result, 'ma')).toEqual([NaN, 15, 25, 35])
    expect(values(result, 'calls')).toEqual([1, 2, 3, 4])
    expect(readQuickJSScriptDefinitionSync(source)).toMatchObject({
      name: 'PersistentSeries',
      pane: 'sub',
      inputs: {},
    })
  })

  it('用户库与内置库走同一 defineLibrary 协议', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot(PlotKind.Line, stats.mid(open, close), { id: 'mid' })`),
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
        source: scriptSource(`plot(PlotKind.Line, close[0], { id: 'close' })`),
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
    `plot(PlotKind.Line, 1, { id: 'x' })`,
    `defineIndicator({ name: 'Bad', pane: 'side', inputs: {}, onBar() {} })`,
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
  it('声明周期参数与算法下拉', () => {
    expect(readQuickJSScriptDefinitionSync(shippedSmaSource).inputs).toEqual({
      period: { default: 20, title: '周期' },
      type: { default: 'SMA', title: '算法', options: ['SMA', 'EMA', 'WMA', 'VWMA'] },
    })
  })

  // 收盘价与成交量都取 1..4、周期 3，期望值即各算法的窗口计算结果。
  it.each([
    ['SMA', [NaN, NaN, 2, 3]],
    ['EMA', [NaN, NaN, 2, 3]],
    ['WMA', [NaN, NaN, 14 / 6, 20 / 6]],
    ['VWMA', [NaN, NaN, 14 / 6, 29 / 9]],
  ])('算法 %s 产出对应的均线序列', async (type, expected) => {
    const result = await runQuickJSScript({
      source: shippedSmaSource,
      bars: barsFromCloses([1, 2, 3, 4], [1, 2, 3, 4]),
      params: { period: 3, type },
    })
    expect(values(result, 'sma')).toEqual(expected)
  })

  // 逐 bar 重新调用 ta.* 必须复用同一派生序列，否则 EMA/RSI 退化为平方级并触发时间上限。
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
      // 预热区两边都应为 NaN，不能走数值近似比较。
      if (Number.isNaN(expectedValue)) expect(Number.isNaN(actual?.[index])).toBe(true)
      else expect(actual?.[index]).toBeCloseTo(expectedValue, 9)
    }
  })

  it('ta.rsi 在长序列上复用派生序列，不触发时间上限', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot(PlotKind.Line, ta.rsi(close, 14)[0], { id: 'rsi' })`),
      bars: barsFromCloses(wavyCloses(2000)),
    })
    expect(Number.isFinite(values(result, 'rsi')?.at(-1))).toBe(true)
  })
})
