/** 验证原生后端与 QuickJS 的数值、绘图契约及每次调用的状态隔离。 */

import { isOhlcPlot } from '@363045841yyt/klinechart-plot-contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { barsFromCloses, wavyCloses } from '../../__tests__/marketData.js'
import { builtinScriptSources } from '../../quickjs/generated/builtinScripts.js'
import { preloadQuickJS, prepareQuickJSScript } from '../../quickjs/impl/runQuickJSScript.js'
import { prepareNativeScript } from '../impl/prepareNativeScript.js'

describe('原生脚本后端', () => {
  beforeAll(preloadQuickJS)

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
