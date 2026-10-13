/** 验证 QuickJS 脚本执行器：全局序列、ta、params、错误与运行隔离。 */
import { describe, expect, it } from 'vitest'
import type { Bar } from '../../contracts/input.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import { readQuickJSScriptDefinitionSync, runQuickJSScript } from '../impl/runQuickJSScript.js'

/** 用完整文件声明包装计算片段，所有用例走相同初始化入口。 */
function scriptSource(body: string, inputs = '{}'): string {
  return `defineIndicator({ name: 'TestScript', pane: 'main', inputs: ${inputs}, onBar() { ${body} } })`
}

/** 生成 close 驱动的完整 K 线，open/high/low 与 close 相同。 */
function barsFromCloses(closes: readonly number[]): Bar[] {
  return closes.map((close, index) => ({
    time: index,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }))
}

/** 取某 id 的值序列，缺失点为 undefined。 */
function values(options: Awaited<ReturnType<typeof runQuickJSScript>>, id: string) {
  return options.plots.find((plot) => plot.id === id)?.data.map((point) => point?.value)
}

describe('runQuickJSScript', () => {
  it('逐 bar 计算 ta.sma，历史不足保留 NaN', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot(ta.sma(close, params.period)[0], { id: 'ma' })`,
        `{ period: input(3, '周期') }`,
      ),
      bars: barsFromCloses([10, 20, 30, 40]),
    })
    expect(values(result, 'ma')).toEqual([NaN, NaN, 20, 30])
  })

  it('序列支持历史偏移，params 作为全局注入', async () => {
    const result = await runQuickJSScript({
      source: scriptSource(
        `plot(close[0] * params.factor, { id: 'scaled' })
plot(close[1], { id: 'prev' })`,
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
        source: scriptSource(`plot(1 / 0, { id: 'bad' })`),
        bars: barsFromCloses([1]),
      }),
    ).rejects.toBeInstanceOf(ScriptPlotError)
  })

  it('两次运行互不影响，序列状态各自独立', async () => {
    const source = scriptSource(`plot(ta.sma(close, 2)[0], { id: 'ma' })`)
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
        plot(average[0], { id: 'ma' })
        plot(++calls, { id: 'calls' })
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
      source: scriptSource(`plot(stats.mid(open, close), { id: 'mid' })`),
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
        source: scriptSource(`plot(close[0], { id: 'close' })`),
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

  it.each([
    `plot(1, { id: 'x' })`,
    `defineIndicator({ name: 'Bad', pane: 'side', inputs: {}, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: { period: input(Infinity) }, onBar() {} })`,
    `defineIndicator({ name: 'Bad', inputs: {}, onBar() {} }); defineIndicator({})`,
  ])('拒绝不完整或错误声明：%s', async (source) => {
    await expect(runQuickJSScript({ source, bars: [] })).rejects.toBeInstanceOf(
      ScriptExecutionError,
    )
  })
})
