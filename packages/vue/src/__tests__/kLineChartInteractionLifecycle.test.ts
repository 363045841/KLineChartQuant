/**
 * KLineChart 交互绑定与 controller 生命周期回归测试。
 * 覆盖 interactionState 订阅显式退订、controllerReady 同步卸载不遗留订阅，
 * 以及 useInteractionBridge 的舞台类名/光标与外部 slot 快照门控。
 */

import { createIdleInteractionSnapshot } from '@363045841yyt/klinechart-core'
import type { ChartController, ChartMountOptions } from '@363045841yyt/klinechart-core/controllers'
import {
  createChartController,
  loadBuiltinIndicators,
} from '@363045841yyt/klinechart-core/controllers'
import type { MarkerEntity } from '@363045841yyt/klinechart-core/engine/marker/registry'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { createMockChartController, type MockChartController } from './_mockController'

let mockController: MockChartController

vi.mock('@363045841yyt/klinechart-core/controllers', async () => {
  const actual = await vi.importActual<typeof import('@363045841yyt/klinechart-core/controllers')>(
    '@363045841yyt/klinechart-core/controllers',
  )
  return {
    ...actual,
    createChartController: vi.fn((_opts: ChartMountOptions) => Promise.resolve(mockController)),
  }
})

import { KlineChart } from '../components/index'
import { useInteractionBridge } from '../composables/chart/useInteractionBridge'

await loadBuiltinIndicators()

async function flushMount(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  mockController = createMockChartController({ data: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('KLineChart interaction lifecycle', () => {
  it('挂载独立左轴，并在分时模式同时显示两侧轴', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()
    const left = wrapper.get('.left-axis-host')
    const options = vi.mocked(createChartController).mock.calls.at(-1)![0]
    expect(options.leftAxisLayer).toBe(left.element)
    expect(options.leftAxisWidth).toBeGreaterThan(0)
    expect(left.isVisible()).toBe(false)

    mockController._setChartMode('timeshare')
    await nextTick()
    expect(left.isVisible()).toBe(true)
    expect(wrapper.get('.right-axis-host').isVisible()).toBe(true)
    expect(wrapper.get('.right-axis-host').classes()).not.toContain('price-axis-host--left')

    mockController._setChartMode('kline')
    await nextTick()
    expect(left.isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('卸载时显式退订 interactionState', async () => {
    const wrapper = mount(KlineChart, { attachTo: document.body })
    await flushMount()

    expect(mockController.interactionSubscriberCount()).toBeGreaterThan(0)
    expect(mockController.dataSubscriberCount()).toBeGreaterThan(0)

    wrapper.unmount()
    await nextTick()

    expect(mockController.interactionSubscriberCount()).toBe(0)
    expect(mockController.dataSubscriberCount()).toBe(0)
  })

  it('controllerReady 同步卸载组件时不遗留下游订阅', async () => {
    let hostWrapper: VueWrapper | null = null
    const Host = defineComponent({
      setup() {
        return () => h(KlineChart, { onControllerReady: () => hostWrapper?.unmount() })
      },
    })

    hostWrapper = mount(Host, { attachTo: document.body })
    await flushMount()

    // 控制器在卸载路径被释放，且 emit 之后的接线未执行
    expect(mockController.disposeCalls()).toBe(1)
    expect(mockController.dataSubscriberCount()).toBe(0)
    expect(mockController.interactionSubscriberCount()).toBe(0)
  })
})

describe('useInteractionBridge 舞台绑定', () => {
  it('把快照映射为舞台类名/光标，并按外部 slot 门控镜像', async () => {
    const mock = createMockChartController()
    const controller = shallowRef<ChartController | null>(mock)
    const stageRef = ref<HTMLDivElement | null>(null)
    const containerRef = ref<HTMLDivElement | null>(null)
    const hasExternalSlot = ref(false)
    let dragCursor: string | null = null
    const onMarkerHover = vi.fn()
    const bridgeRef = shallowRef<ReturnType<typeof useInteractionBridge> | null>(null)

    const Host = defineComponent({
      setup() {
        bridgeRef.value = useInteractionBridge({
          controller,
          stageRef,
          containerRef,
          hasExternalSlot,
          getDragCursor: () => dragCursor,
          onMarkerHover,
        })
        return () => h('div', { ref: stageRef }, [h('div', { ref: containerRef })])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    await flushMount()

    const stage = stageRef.value
    const container = containerRef.value
    expect(stage).not.toBeNull()
    expect(container).not.toBeNull()

    // 悬停 K 线：光标 pointer + 类名，外部 slot 未开启时镜像保持空态
    mock._setInteractionState({ ...createIdleInteractionSnapshot(), hoveredIndex: 3 })
    await nextTick()
    expect(container?.style.cursor).toBe('pointer')
    expect(stage?.classList.contains('is-hovering-kline')).toBe(true)
    expect(bridgeRef.value?.externalState.value.hoveredIndex).toBeNull()

    // 开启外部 slot 后镜像跟随快照
    hasExternalSlot.value = true
    mock._setInteractionState({ ...createIdleInteractionSnapshot(), hoveredIndex: 4 })
    await nextTick()
    expect(bridgeRef.value?.externalState.value.hoveredIndex).toBe(4)

    // 图元拖拽冻结光标优先于通用 hover
    dragCursor = 'move'
    mock._setInteractionState({
      ...createIdleInteractionSnapshot(),
      drawingHoverTarget: 'all',
      hoveredIndex: 1,
    })
    await nextTick()
    expect(container?.style.cursor).toBe('move')
    expect(stage?.classList.contains('is-dragging-drawing')).toBe(true)
    expect(stage?.dataset.drawingCursor).toBe('all')

    // 面板分隔缩放
    dragCursor = null
    mock._setInteractionState({
      ...createIdleInteractionSnapshot(),
      isResizingPaneBoundary: true,
    })
    await nextTick()
    expect(container?.style.cursor).toBe('ns-resize')
    expect(stage?.classList.contains('is-resizing-pane')).toBe(true)

    // marker 悬停镜像与回调
    const marker: MarkerEntity = {
      id: 'm1',
      type: 'circle',
      markerType: 'RISE_WITH_VOLUME',
      x: 0,
      y: 0,
      width: 8,
      height: 8,
      dataIndex: 0,
      metadata: {},
    }
    mock._setInteractionState({ ...createIdleInteractionSnapshot(), hoveredMarkerData: marker })
    await nextTick()
    expect(bridgeRef.value?.hoveredMarker.value).toBe(marker)
    expect(onMarkerHover).toHaveBeenCalled()

    wrapper.unmount()
    await nextTick()
    expect(mock.interactionSubscriberCount()).toBe(0)
  })
})
