/** 验证执行器层行为：参数注入、错误阶段、运行隔离、库加载与超时。 */
import { describe, expect, it } from 'vitest'
import { barsFromCloses, requireValues, scriptSource } from '../../__tests__/marketData.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { runQuickJSScript } from '../impl/runQuickJSScript.js'

describe('脚本执行器', () => {
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
    expect(requireValues(result, 'scaled')).toEqual([100, 200, 300, 400])
    expect(requireValues(result, 'ma')).toEqual([undefined, undefined, 20, 30])
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
    expect(requireValues(first, 'ma')).toEqual([undefined, 15, 25])
    expect(requireValues(second, 'ma')).toEqual([undefined, 150, 250])
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
    expect(requireValues(result, 'ma')).toEqual([undefined, 15, 25, 35])
    expect(requireValues(result, 'calls')).toEqual([1, 2, 3, 4])
  })

  it('用户库与内置库走同一 defineLibrary 协议', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(`plot.Line(stats.mid(open, close), 'mid')`),
      bars: barsFromCloses([10, 20]),
      libraries: [
        { name: 'stats', source: `defineLibrary('stats', { mid: (a, b) => (a[0] + b[0]) / 2 })` },
      ],
    })
    expect(requireValues(result, 'mid')).toEqual([10, 20])
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
})
