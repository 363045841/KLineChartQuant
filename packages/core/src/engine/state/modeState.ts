import { createSubState } from '../../foundation/reactivity/signal'

export type ChartModeId = 'kline' | 'timeshare'

export function createModeState() {
  const { signals, readonly } = createSubState({
    chartMode: 'kline' as ChartModeId,
  })

  return {
    readonly,
    actions: {
      setChartMode(mode: ChartModeId) {
        if (signals.chartMode.peek() === mode) return
        signals.chartMode.set(mode)
      },
    },
    dispose() {
      signals.chartMode.set('kline')
    },
  }
}

export type ModeStateModule = ReturnType<typeof createModeState>
