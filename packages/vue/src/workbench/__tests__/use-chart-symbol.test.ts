/**
 * 图表品种桥接的验收：订阅 Core signal，换品种后 Vue 侧跟着变；
 * 换品种瞬间上下文为空时保留上一个品种，不闪回默认值。
 */
import { createSignal, type ReadonlySignal } from '@363045841yyt/klinechart-core/reactivity'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import {
  type ChartSymbolProvider,
  DEFAULT_CHART_SYMBOL,
  useChartSymbol,
} from '../impl/use-chart-symbol.js'

/** 当前替身控制器；组件通过闭包读取，避免在模板里做类型断言。 */
let current: ChartSymbolProvider | null = null

/** 只暴露 agent.context 的替身；真实控制器结构兼容。 */
function providerOf(context: ReadonlySignal<unknown>): ChartSymbolProvider {
  return { agent: { context } }
}

/** 把 composable 的结果渲染成文本。 */
const Probe = defineComponent({
  setup() {
    const symbol = useChartSymbol(() => current)
    return { symbol }
  },
  template: '<span data-testid="symbol">{{ symbol }}</span>',
})

/**
 * 取渲染出的品种文本。
 *
 * @param wrapper 挂载结果
 * @returns 文本
 */
function symbolOf(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('[data-testid="symbol"]').text()
}

describe('useChartSymbol', () => {
  it('订阅 Core 上下文：换品种后跟着变，并去掉永续后缀', async () => {
    const context = createSignal<unknown>({ symbol: 'BTCUSDT.P' })
    current = providerOf(context)
    const wrapper = mount(Probe)

    expect(symbolOf(wrapper)).toBe('BTCUSDT')

    context.set({ symbol: 'XRPUSDT.P' })
    await nextTick()

    expect(symbolOf(wrapper)).toBe('XRPUSDT')
  })

  it('换品种瞬间的空上下文保留上一个品种', async () => {
    const context = createSignal<unknown>({ symbol: 'ETHUSDT' })
    current = providerOf(context)
    const wrapper = mount(Probe)

    expect(symbolOf(wrapper)).toBe('ETHUSDT')

    context.set(null)
    await nextTick()

    expect(symbolOf(wrapper)).toBe('ETHUSDT')
  })

  it('没有控制器时回落到默认品种', () => {
    current = null
    const wrapper = mount(Probe)

    expect(symbolOf(wrapper)).toBe(DEFAULT_CHART_SYMBOL)
    expect(DEFAULT_CHART_SYMBOL).toBe('BTCUSDT')
  })
})
