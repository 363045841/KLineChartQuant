import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContextWithInstanceState,
  createMARenderState,
  createMockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createMALayer } from '../Indicator/ma'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const MA_INSTANCE_ID = 'inst-ma'

let ctx: CanvasRenderingContext2D

beforeEach(() => {
  ctx = createMockCanvasContext()
})

/** 构造绑定固定实例身份的 MA Layer。 */
function createTestMALayer(instanceId: string | undefined = MA_INSTANCE_ID) {
  return createMALayer({ instanceId })
}

describe('createMALayer', () => {
  it('should expose the ma layer identity', () => {
    const layer = createTestMALayer()

    expect(layer.id).toBe('plugin:ma')
    expect(layer.role).toBe('primary')
    expect(layer.pane).toBe('main')
    expect(layer.visible).toBe(true)
  })
})

describe('MA layer paint', () => {
  it('should not draw when the instance projection is missing', () => {
    createTestMALayer().paint(createContextWithInstanceState(ctx, MA_INSTANCE_ID, undefined))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data (visibleMin > visibleMax)', () => {
    const state = createMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
      enabledPeriods: [],
    })

    createTestMALayer().paint(createContextWithInstanceState(ctx, MA_INSTANCE_ID, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when no periods are enabled', () => {
    const state = createMARenderState({ enabledPeriods: [] })

    createTestMALayer().paint(createContextWithInstanceState(ctx, MA_INSTANCE_ID, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    createTestMALayer().paint(
      createContextWithInstanceState(ctx, MA_INSTANCE_ID, createMARenderState()),
    )

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledAfter(ctx.save as ReturnType<typeof vi.fn>)
  })

  it('should translate context by -scrollLeft', () => {
    createTestMALayer().paint(
      createContextWithInstanceState(ctx, MA_INSTANCE_ID, createMARenderState(), {
        scrollLeft: 100,
      }),
    )

    expect(ctx.translate).toHaveBeenCalledWith(-100, 0)
  })

  it('should set correct stroke style and line properties', () => {
    createTestMALayer().paint(
      createContextWithInstanceState(ctx, MA_INSTANCE_ID, createMARenderState()),
    )

    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should draw lines for enabled periods', () => {
    const state = createMARenderState({
      series: { 5: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
      enabledPeriods: [5],
      visibleMin: 10,
      visibleMax: 19,
    })

    createTestMALayer().paint(
      createContextWithInstanceState(ctx, MA_INSTANCE_ID, state, {
        range: { start: 0, end: 10 },
        kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      }),
    )

    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.moveTo).toHaveBeenCalled()
    expect(ctx.lineTo).toHaveBeenCalled()
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should skip undefined values in series', () => {
    const state = createMARenderState({
      series: { 5: [undefined, undefined, 12, 13, 14, 15, 16, 17, 18, 19] },
      enabledPeriods: [5],
    })

    createTestMALayer().paint(
      createContextWithInstanceState(ctx, MA_INSTANCE_ID, state, {
        range: { start: 0, end: 10 },
        kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      }),
    )

    // 首个有效值位于索引 2，moveTo 只应调用一次。
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
  })

  it('should use correct colors for each period', () => {
    const state = createMARenderState({
      series: {
        5: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        10: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        20: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        30: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
        60: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      },
      enabledPeriods: [5, 10, 20, 30, 60],
    })

    createTestMALayer().paint(createContextWithInstanceState(ctx, MA_INSTANCE_ID, state))

    // 每个周期一条线，共 5 条。
    expect(ctx.stroke).toHaveBeenCalledTimes(5)
  })
})

describe('MA layer state reading', () => {
  it('should not cache state and read fresh projection on each paint', () => {
    const layer = createTestMALayer()
    const context = createContextWithInstanceState(ctx, MA_INSTANCE_ID, createMARenderState())
    const get = context.indicatorStateReader?.get

    layer.paint(context)
    expect(get).toHaveBeenCalledTimes(1)

    layer.paint(context)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('should not expose any cache-related members', () => {
    const layer = createTestMALayer()

    expect('maCache' in layer).toBe(false)
    expect('cachedData' in layer).toBe(false)
    expect('getMAData' in layer).toBe(false)
    expect('onDataUpdate' in layer).toBe(false)
  })
})
