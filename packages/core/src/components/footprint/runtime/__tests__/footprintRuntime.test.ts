/** 验证足迹独立链路的增量传输、过期隔离、模式启停和参数归属。 */
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createSignal } from '@/foundation/reactivity/signal.js'
import { getIndicatorDescriptors } from '@/engine/indicators/indicatorDefinitionRegistry.js'
import { batch, trade, input, runtimeInput } from '../../__tests__/helpers/footprintTestKit.js'
import { createFootprintHarness } from './helpers/footprintModeTestKit.js'
import { FOOTPRINT_TEXT_MODES } from '../../types.js'
import type { FootprintInput, FootprintResult } from '../types.js'
import { createFootprintRuntime } from '../impl/createFootprintRuntime.js'
import { createFootprintExecution } from '../impl/footprintExecution.js'
import { diffFootprintTrades } from '../impl/tradeDiff.js'

describe('足迹主序列运行模块', () => {
  it('增量、重复快照、历史替换和市场切换均不重复累计成交', () => {
    const a = batch([trade('a', 1500, '1.2', '2', 'buy')])
    const b = batch([trade('b', 1600, '1.2', '1', 'sell')])
    const execute = createFootprintExecution()
    let previous: FootprintInput | undefined
    const cases = [
      { current: runtimeInput([a]), mode: 'replace', added: 1, total: '2.4' },
      { current: runtimeInput([a, b]), mode: 'append', added: 1, total: '3.6' },
      { current: runtimeInput([a, b]), mode: 'append', added: 0, total: '3.6' },
      { current: runtimeInput([b]), mode: 'replace', added: 1, total: '1.2' },
      { current: runtimeInput([a], 'other:5min'), mode: 'replace', added: 1, total: '2.4' },
    ]
    for (const [index, item] of cases.entries()) {
      const diff = diffFootprintTrades(previous?.marketKey === item.current.marketKey ? previous.trades : undefined, item.current.trades)
      expect(diff.mode).toBe(item.mode)
      expect(diff.snapshot.batches).toHaveLength(item.added)
      const response = execute(structuredClone({ requestId: index, ...item.current, trades: diff }))
      if (!('series' in response)) throw new Error(response.error)
      expect(response.series.bars[0]?.total).toBe(item.total)
      previous = item.current
    }
  })

  it('合并高频更新，旧任务、退出模式和销毁后的任务不能提交', async () => {
    const first = runtimeInput([batch([trade('a', 1500, '1.2', '2', 'buy')])])
    const latest = runtimeInput([batch([trade('b', 1500, '1.2', '3', 'buy')])])
    const input$ = createSignal<FootprintInput | null>(first)
    const committed: FootprintResult[] = []
    const runtime = createFootprintRuntime({ input$, createWorker: () => null, commit: (result) => { if (result) committed.push(result) } })
    onTestFinished(() => runtime.dispose())
    input$.set(runtimeInput([]))
    input$.set(latest)
    await vi.waitFor(() => expect(committed).toHaveLength(1))
    expect(committed[0]?.input).toBe(latest)
    expect(committed[0]?.series.bars[0]?.total).toBe('3.6')
    input$.set(first)
    input$.set(null)
    await Promise.resolve()
    expect(committed).toHaveLength(1)
    input$.set(latest)
    runtime.dispose()
    await Promise.resolve()
    expect(committed).toHaveLength(1)
  })

  it('足迹由 K 线设置驱动，不注册指标；文字切换不重算，周期与分时切换清除旧结果', async () => {
    const { kernel, selectPeriod } = createFootprintHarness()
    const snapshot = input([batch([trade('a', 1500, '1.2', '2', 'buy')])])
    kernel.data.actions.setTrades(snapshot)
    const state = kernel.footprint.readonly
    await vi.waitFor(() => expect(state.renderState.peek()?.series.bars[0]?.total).toBe('2.4'))
    expect(getIndicatorDescriptors().some((item) => item.name.toLowerCase() === 'footprint')).toBe(false)
    expect(kernel.mode.readonly.effectivePrimaryRenderer.peek()).toBe('footprint')
    const currentInput = state.input.peek()
    const series = state.renderState.peek()?.series
    kernel.settings.actions.patch({ footprintTextMode: FOOTPRINT_TEXT_MODES.Delta })
    expect(state.input.peek()).toBe(currentInput)
    expect(state.renderState.peek()?.series).toBe(series)
    expect(state.renderState.peek()?.textMode).toBe(FOOTPRINT_TEXT_MODES.Delta)
    selectPeriod('5min')
    expect(kernel.data.readonly.trades.peek().batches).toHaveLength(0)
    expect(state.renderState.peek()?.series.bars).toHaveLength(0)
    kernel.actions.setDataView('timeshare')
    expect(state.enabled.peek()).toBe(false)
    expect(state.renderState.peek()).toBeNull()
    kernel.actions.setDataView('kline')
    expect(state.enabled.peek()).toBe(true)
    kernel.settings.actions.patch({ klineShape: 'candlestick' })
    expect(state.input.peek()).toBeNull()
    expect(state.renderState.peek()).toBeNull()
  })

  it('不支持原始逐笔成交的品种不激活足迹，也没有任何图上文案', async () => {
    const { kernel, selectPeriod } = createFootprintHarness()
    kernel.data.actions.setTrades(input([batch([trade('a', 1500, '1.2', '2', 'buy')])]))
    const state = kernel.footprint.readonly
    await vi.waitFor(() => expect(state.renderState.peek()?.series.bars[0]?.total).toBe('2.4'))
    expect(state.supported.peek()).toBe(true)
    // 会话不再声明原始成交流能力：不请求成交、不聚合，图上既无足迹也无提示文案。
    selectPeriod('1min', { assetClasses: ['stock'] })
    expect(state.supported.peek()).toBe(false)
    expect(state.enabled.peek()).toBe(false)
    expect(state.input.peek()).toBeNull()
    expect(state.renderState.peek()).toBeNull()
  })
})
