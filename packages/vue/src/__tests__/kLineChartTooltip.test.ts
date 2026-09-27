/**
 * KLineChart 默认 K 线 tooltip 回归测试。
 * 覆盖空数据隐藏、悬停命中后显示内容、清空数据重新隐藏，以及 composable 的订阅清理。
 */

import { createIdleInteractionSnapshot, type KLineData } from '@363045841yyt/klinechart-core'
import { loadBuiltinIndicators } from '@363045841yyt/klinechart-core/controllers'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { createMockChartController, type MockChartController } from './_mockController'

let mockController: MockChartController

vi.mock('@363045841yyt/klinechart-core/controllers', async () => {
  const actual = await vi.importActual<typeof import('@363045841yyt/klinechart-core/controllers')>(
    '@363045841yyt/klinechart-core/controllers',
  )
  return {
    ...actual,
    createChartController: () => Promise.resolve(mockController),
  }
})

import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { KlineChart } from '../components/index'
import { useKLineTooltip } from '../composables/chart/useKLineTooltip'

// 预加载内置指标，避免环境销毁后触发动态导入
await loadBuiltinIndicators()

const BAR: KLineData = {
  timestamp: Date.UTC(2025, 0, 2),
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 1000,
  turnover: 11000,
  amplitude: 30,
  changePercent: 10,
  changeAmount: 1,
  turnoverRate: 2,
  symbol: 'TEST',
}

async function flushMount(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('KLineChart 默认 K 线 tooltip', () => {
  beforeEach(() => {
    mockController = createMockChartController({ data: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('空数据保持隐藏，悬停命中后才显示内容，清空数据后重新隐藏', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    const tooltip = wrapper.get<HTMLElement>('.kline-tooltip')
    // 空数据：显式隐藏，避免渲染空白框
    expect(tooltip.element.style.display).toBe('none')

    // 有数据但未悬停：仍保持隐藏
    mockController._setData([BAR])
    await nextTick()
    expect(tooltip.element.style.display).toBe('none')

    // 悬停命中：显示并构建标题与字段网格
    mockController._setInteractionState({
      ...createIdleInteractionSnapshot(),
      hoveredIndex: 0,
      tooltipPos: { x: 12, y: 24 },
    })
    await nextTick()
    expect(tooltip.element.style.display).toBe('')
    expect(tooltip.find('.kline-tooltip__title').exists()).toBe(true)
    expect(tooltip.find('.kline-tooltip__grid').exists()).toBe(true)
    expect(tooltip.element.style.left).toBe('12px')
    expect(tooltip.element.style.top).toBe('24px')

    // 清空数据：重新隐藏并复位缓存索引
    mockController._setData([])
    await nextTick()
    expect(tooltip.element.style.display).toBe('none')

    wrapper.unmount()
  })
})

describe('useKLineTooltip 订阅生命周期', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('卸载时退订 interactionState 与 data', async () => {
    const mock = createMockChartController()
    const controller = shallowRef<ChartController | null>(mock)
    const Host = defineComponent({
      setup() {
        const contentRef = ref<HTMLDivElement | null>(null)
        const containerRef = ref<HTMLDivElement | null>(null)
        const colors = computed(() => ({ upColor: '#ff0000', downColor: '#00aa00' }))
        const hasExternalSlot = ref(false)
        useKLineTooltip({
          controller,
          contentRef,
          containerRef,
          colors,
          hasExternalSlot,
          isMobile: false,
          isIntraday: () => false,
          timezone: () => 'Asia/Shanghai',
          isDraggable: () => true,
        })
        return () =>
          h('div', { ref: containerRef }, [h('div', { ref: contentRef, class: 'kline-tooltip' })])
      },
    })

    const wrapper = mount(Host, { attachTo: document.body })
    await flushMount()

    expect(mock.interactionSubscriberCount()).toBe(1)
    expect(mock.dataSubscriberCount()).toBe(1)

    wrapper.unmount()
    await nextTick()

    expect(mock.interactionSubscriberCount()).toBe(0)
    expect(mock.dataSubscriberCount()).toBe(0)
  })
})
