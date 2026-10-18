/** 验证原生后端与 QuickJS 的数值、绘图契约及每次调用的状态隔离。 */

import { isOhlcPlot } from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { barsFromCloses, wavyCloses } from '../../__tests__/marketData.js'
import { builtinScriptSources } from '../../quickjs/generated/builtinScripts.js'
import { preloadQuickJS, prepareQuickJSScript } from '../../quickjs/impl/runQuickJSScript.js'
import { prepareNativeScript } from '../impl/prepareNativeScript.js'

describe('原生脚本后端', () => {
  beforeAll(preloadQuickJS)

  it.each([prepareNativeScript, prepareQuickJSScript])('执行器 %s 输出两种阶梯线并保留样式与 fill 句柄', (prepare) => {
    const prepared = prepare(`defineIndicator({ name: 'Steps', position: 'main', onBar() {
      const value = close[0] === 2 ? null : close[0] === 3 ? NaN : close[0]
      const joined = plot.StepLine(value, 'joined')
      const broken = plot.StepLineBR(value, 'broken', {
        color: Color.Red, dash: [4, 2], offset: 1, size: ShapeSize.Large, visible: false
      })
      fill(joined, broken, Color.Blue)
    } })`)
    const result = prepared.run(barsFromCloses([1, 2, 3, 4]))
    expect(result.plots).toEqual([
      expect.objectContaining({ id: 'joined', kind: 'stepline', dash: [], offset: 0, visible: true }),
      expect.objectContaining({ id: 'broken', kind: 'steplinebr', dash: [4, 2], offset: 1, size: 'large', visible: false }),
    ])
    for (const plot of result.plots) {
      if (isOhlcPlot(plot)) throw new Error('Expected step Plot')
      expect(plot.data.map((point) => point?.value)).toEqual([1, undefined, undefined, 4])
    }
    expect(result.fills[0]).toMatchObject({ from: 'joined', to: 'broken' })
    const invalid = prepare(`defineIndicator({ name: 'InvalidStep', position: 'main', onBar() {
      plot.StepLineBR(close, 'step', { dash: 'invalid' })
    } })`)
    expect(() => invalid.run(barsFromCloses([1]))).toThrow('无效 plot 调用参数')
    const changing = prepare(`defineIndicator({ name: 'ChangingStep', position: 'main', onBar() {
      (close[0] > 1 ? plot.StepLineBR : plot.StepLine)(close[0], 'step')
    } })`)
    expect(() => changing.run(barsFromCloses([1, 2]))).toThrow('cannot change kind')
  })

  it.each([prepareNativeScript, prepareQuickJSScript])('执行器 %s 保留折线空值与连接策略', (prepare) => {
    const prepared = prepare(`defineIndicator({ name: 'Gaps', position: 'main', onBar() {
      const value = close[0] === 2 ? null : close[0]
      const joined = plot.Line(value, 'joined')
      const broken = plot.LineBR(value, 'broken', { dash: [4, 4], offset: 1 })
      fill(joined, broken, Color.Blue)
    } })`)
    const result = prepared.run(barsFromCloses([1, 2, 3]))
    expect(result.plots.map((plot) => ({ ...plot, data: [] }))).toEqual([
      expect.objectContaining({ id: 'joined', kind: 'line' }),
      expect.objectContaining({ id: 'broken', kind: 'linebr', dash: [4, 4], offset: 1 }),
    ])
    expect(result.fills[0]).toMatchObject({ from: 'joined', to: 'broken' })
    for (const plot of result.plots) {
      if (isOhlcPlot(plot)) throw new Error('Expected line Plot')
      expect(plot.data.map((point) => point?.value)).toEqual([1, undefined, 3])
    }
  })

  it.each([prepareNativeScript, prepareQuickJSScript])('执行器 %s 校验 LineBR 样式及整列类型一致性', (prepare) => {
    const invalid = prepare(`defineIndicator({ name: 'InvalidGaps', position: 'main', onBar() {
      plot.LineBR(close[0], 'line', { dash: 'invalid' })
    } })`)
    expect(() => invalid.run(barsFromCloses([1]))).toThrow('无效 plot 调用参数')
    const changing = prepare(`defineIndicator({ name: 'ChangingGaps', position: 'main', onBar() {
      (close[0] > 1 ? plot.LineBR : plot.Line)(close[0], 'line')
    } })`)
    expect(() => changing.run(barsFromCloses([1, 2]))).toThrow('cannot change kind')
  })

  it.each(builtinScriptSources.map((source, index) => ({ source, index })))(
    '内置脚本 $index 的声明、数值、样式和填充与 QuickJS 一致',
    ({ source }) => {
      const native = prepareNativeScript(source)
      const sandbox = prepareQuickJSScript(source)
      expect(native.definition).toEqual(sandbox.definition)
      const bars = barsFromCloses(wavyCloses(60))
      const expected = sandbox.run(bars)
      const actual = native.run(bars)
      expect(actual.fills).toEqual(expected.fills)
      expect(actual.plots).toHaveLength(expected.plots.length)
      actual.plots.forEach((plot, index) => {
        const reference = expected.plots[index]!
        if (isOhlcPlot(plot) || isOhlcPlot(reference))
          throw new Error('Expected scalar builtin Plot')
        expect({ ...plot, data: [] }).toEqual({ ...reference, data: [] })
        expect(plot.data).toHaveLength(reference.data.length)
        plot.data.forEach((point, barIndex) => {
          const expectedPoint = reference.data[barIndex]
          if (!point || !expectedPoint) expect(point).toEqual(expectedPoint)
          else {
            expect({ ...point, value: 0 }).toEqual({ ...expectedPoint, value: 0 })
            expect(point.value).toBeCloseTo(expectedPoint.value, 9)
          }
        })
      })
      expect(native.run([])).toEqual(sandbox.run([]))
      expect(native.run(bars.slice(0, 10))).toEqual(
        prepareNativeScript(source).run(bars.slice(0, 10)),
      )
    },
  )

  it('复用外部库、参数和行情 API，每次调用重新初始化状态，不写入宿主全局', () => {
    const source = `
      globalThis.nativeTestMarker = true
      let total = 0
      defineIndicator({ name: 'NativeState', position: 'main', onBar() {
        const divisor = input.int(2)
        total += custom.value(close[0]) / divisor
        plot.Line(total, 'total')
      } })`
    const libraries = [
      { name: 'custom', source: `defineLibrary('custom', { value: (n: number) => n * 2 })` },
    ]
    const native = prepareNativeScript(source, libraries)
    const sandbox = prepareQuickJSScript(source, libraries)
    const bars = barsFromCloses([2, 4, 6])
    for (const params of [{ divisor: 2 }, { divisor: 4 }, { divisor: 2 }])
      expect(native.run(bars, params)).toEqual(sandbox.run(bars, params))
    expect(Object.hasOwn(globalThis, 'custom')).toBe(false)
    expect(Object.hasOwn(globalThis, 'nativeTestMarker')).toBe(false)
  })

  it('保留无穷值诊断、编译与运行错误的阶段', () => {
    expect(() => prepareNativeScript('export const n = 1')).toThrow()
    expect(() => prepareNativeScript(`plot.Line(1, 'bad')`)).toThrow('plot 只能在 onBar 中调用')
    const prepared = prepareNativeScript(
      `defineIndicator({ name: 'BadNative', position: 'main', onBar() { plot.Line(1 / 0, 'infinite') } })`,
    )
    expect(() => prepared.run(barsFromCloses([1]))).toThrow(
      expect.objectContaining({
        code: 'SCRIPT_INFINITE_PLOT_VALUE',
        plotName: 'infinite',
        barIndex: 0,
      }),
    )
    const runtimeError = prepareNativeScript(
      `defineIndicator({ name: 'BadNative', position: 'main', onBar() { throw new Error('native failed') } })`,
    )
    expect(() => runtimeError.run(barsFromCloses([1]))).toThrow(
      expect.objectContaining({ code: 'SCRIPT_RUN_FAILED' }),
    )
  })
})
