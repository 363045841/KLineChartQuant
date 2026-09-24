/** 验证轴标签单帧聚合的 Pane 隔离、共享 X 轴与注册 API。 */
import { describe, expect, it } from 'vitest'
import { createMockRenderContext } from '@/engine/__tests__/helpers/renderTestKit'
import {
  createAxisLabelsFrame,
  createXAxisLabelCollector,
  createYAxisLabelCollector,
  registerYAxisLabel,
} from '../index'

describe('createAxisLabelsFrame', () => {
  it('keeps Y axis labels isolated per pane', () => {
    const frame = createAxisLabelsFrame()
    frame.yForPane('main').register({ price: 10, y: 100 })
    frame.yForPane('volume').register({ price: 2, y: 40 })

    expect(frame.yForPane('main').labels).toEqual([{ price: 10, y: 100 }])
    expect(frame.yForPane('volume').labels).toEqual([{ price: 2, y: 40 }])
  })

  it('returns the same Y collector for a repeated paneId', () => {
    const frame = createAxisLabelsFrame()
    expect(frame.yForPane('main')).toBe(frame.yForPane('main'))
  })

  it('shares a single X axis collector across panes', () => {
    const frame = createAxisLabelsFrame()
    frame.x.register({ timestamp: 1_000, x: 10 })

    expect(frame.x.labels).toEqual([{ timestamp: 1_000, x: 10 }])
  })
})

describe('label collectors', () => {
  it('registers labels in order and ignores empty batches', () => {
    const collector = createYAxisLabelCollector()
    collector.register({ price: 1, y: 1 })
    collector.registerAll([])
    collector.registerAll([
      { price: 2, y: 2 },
      { price: 3, y: 3 },
    ])

    expect(collector.labels.map((label) => label.price)).toEqual([1, 2, 3])
  })

  it('exposes the mutable buffer consumed by renderers', () => {
    const collector = createXAxisLabelCollector()
    collector.register({ timestamp: 1, x: 1 })

    // 渲染器直接消费同一数组引用，注册后立即可见。
    expect(collector.labels).toHaveLength(1)
  })
})

describe('registerYAxisLabel', () => {
  it('routes through the injected registrar when present', () => {
    const collector = createYAxisLabelCollector()
    const context = createMockRenderContext({ yAxisLabelRegistrar: collector })

    registerYAxisLabel(context, { price: 10, y: 100 })

    // 注册器持有独立缓冲，注册后立即可见。
    expect(collector.labels).toEqual([{ price: 10, y: 100 }])
  })

  it('falls back to the context array when no registrar is injected', () => {
    const context = createMockRenderContext()

    registerYAxisLabel(context, { price: 20, y: 200 })

    expect(context.yAxisLabels).toEqual([{ price: 20, y: 200 }])
  })
})
