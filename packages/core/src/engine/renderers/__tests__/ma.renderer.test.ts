import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MARenderState } from '@/core/indicators/state/maState'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/plugin'
import { createMALayer } from '../Indicator/ma'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const MA_INSTANCE_ID = 'inst-ma'

/** 构造测试用的 MARenderState。 */
function createTestMARenderState(overrides: Partial<MARenderState> = {}): MARenderState {
  return {
    timestamp: Date.now(),
    series: {
      5: [undefined, undefined, undefined, undefined, 12, 13, 14, 15, 16, 17],
      10: [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        14.5,
      ],
    },
    enabledPeriods: [5, 10],
    visibleMin: 12,
    visibleMax: 17,
    ...overrides,
  }
}

/** 构造绑定固定实例身份的 MA Layer。 */
function createTestMALayer(instanceId: string | undefined = MA_INSTANCE_ID) {
  return createMALayer({ instanceId })
}

/** 构造携带实例投影的帧上下文。 */
function createContextWithState(
  ctx: CanvasRenderingContext2D,
  state?: MARenderState,
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return createMockRenderContext({
    ctx,
    indicatorStateReader: {
      get: <T>(key: string) => (key === MA_INSTANCE_ID ? (state as T) : undefined),
    },
    ...overrides,
  })
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
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    createTestMALayer().paint(createContextWithState(ctx, undefined))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data (visibleMin > visibleMax)', () => {
    const state = createTestMARenderState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
      enabledPeriods: [],
    })

    createTestMALayer().paint(createContextWithState(ctx, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when no periods are enabled', () => {
    const state = createTestMARenderState({ enabledPeriods: [] })

    createTestMALayer().paint(createContextWithState(ctx, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    createTestMALayer().paint(createContextWithState(ctx, createTestMARenderState()))

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledAfter(ctx.save as ReturnType<typeof vi.fn>)
  })

  it('should translate context by -scrollLeft', () => {
    createTestMALayer().paint(
      createContextWithState(ctx, createTestMARenderState(), { scrollLeft: 100 }),
    )

    expect(ctx.translate).toHaveBeenCalledWith(-100, 0)
  })

  it('should set correct stroke style and line properties', () => {
    createTestMALayer().paint(createContextWithState(ctx, createTestMARenderState()))

    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should draw lines for enabled periods', () => {
    const state = createTestMARenderState({
      series: { 5: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] },
      enabledPeriods: [5],
      visibleMin: 10,
      visibleMax: 19,
    })

    createTestMALayer().paint(
      createContextWithState(ctx, state, {
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
    const state = createTestMARenderState({
      series: { 5: [undefined, undefined, 12, 13, 14, 15, 16, 17, 18, 19] },
      enabledPeriods: [5],
    })

    createTestMALayer().paint(
      createContextWithState(ctx, state, {
        range: { start: 0, end: 10 },
        kLineCenters: Array.from({ length: 10 }, (_, i) => i * 10 + 5),
      }),
    )

    // 首个有效值位于索引 2，moveTo 只应调用一次。
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
  })

  it('should use correct colors for each period', () => {
    const state = createTestMARenderState({
      series: {
        5: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        10: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        20: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        30: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
        60: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      },
      enabledPeriods: [5, 10, 20, 30, 60],
    })

    createTestMALayer().paint(createContextWithState(ctx, state))

    // 每个周期一条线，共 5 条。
    expect(ctx.stroke).toHaveBeenCalledTimes(5)
  })
})

describe('MA layer state reading', () => {
  it('should not cache state and read fresh projection on each paint', () => {
    const state = createTestMARenderState()
    const reader = createMockStateReader(MA_INSTANCE_ID, state)
    const layer = createTestMALayer()
    const context = createMockRenderContext({
      ctx: createMockCanvasContext(),
      indicatorStateReader: reader,
    })

    layer.paint(context)
    expect(reader.get).toHaveBeenCalledTimes(1)

    layer.paint(context)
    expect(reader.get).toHaveBeenCalledTimes(2)
  })

  it('should not expose any cache-related members', () => {
    const layer = createTestMALayer()

    expect('maCache' in layer).toBe(false)
    expect('cachedData' in layer).toBe(false)
    expect('getMAData' in layer).toBe(false)
    expect('onDataUpdate' in layer).toBe(false)
  })
})
