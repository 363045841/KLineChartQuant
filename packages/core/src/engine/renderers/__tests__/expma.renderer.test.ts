import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EXPMARenderState } from '@/core/indicators/state/expmaState'
import {
  createMockCanvasContext,
  createMockRenderContext,
  createMockStateReader,
} from '@/engine/__tests__/helpers/renderTestKit'
import type { RenderContext } from '@/plugin'
import { createEXPMALayer } from '../Indicator/expma'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const EXPMA_INSTANCE_ID = 'inst-expma'

/** 构造测试用 EXPMARenderState。 */
function createTestEXPMARenderState(overrides: Partial<EXPMARenderState> = {}): EXPMARenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) => ({
      fast: 100 + i * 0.2,
      slow: 100 + i * 0.1,
    })),
    params: {
      fastPeriod: 12,
      slowPeriod: 50,
    },
    visibleMin: 100,
    visibleMax: 120,
    ...overrides,
  }
}

/** 构造绑定固定实例身份的 EXPMA Layer。 */
function createTestEXPMALayer() {
  return createEXPMALayer({ instanceId: EXPMA_INSTANCE_ID })
}

/** 构造携带实例投影的帧上下文。 */
function createContextWithState(
  ctx: CanvasRenderingContext2D,
  state?: EXPMARenderState,
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return createMockRenderContext({
    ctx,
    indicatorStateReader: {
      get: <T>(key: string) => (key === EXPMA_INSTANCE_ID ? (state as T) : undefined),
    },
    ...overrides,
  })
}

describe('createEXPMALayer', () => {
  it('should expose the expma layer identity', () => {
    const layer = createTestEXPMALayer()

    expect(layer.id).toBe('plugin:expma')
    expect(layer.role).toBe('primary')
    expect(layer.pane).toBe('main')
    expect(layer.visible).toBe(true)
  })
})

describe('EXPMA layer paint', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    createTestEXPMALayer().paint(createContextWithState(ctx, undefined))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestEXPMARenderState({ visibleMin: Infinity, visibleMax: -Infinity })

    createTestEXPMALayer().paint(createContextWithState(ctx, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    createTestEXPMALayer().paint(createContextWithState(ctx, createTestEXPMARenderState()))

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should draw both fast and slow lines', () => {
    const state = createTestEXPMARenderState()
    const reader = createMockStateReader(EXPMA_INSTANCE_ID, state)

    createTestEXPMALayer().paint(
      createContextWithState(ctx, state, { indicatorStateReader: reader }),
    )

    expect(ctx.stroke).toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(reader.get).toHaveBeenCalledWith(EXPMA_INSTANCE_ID)
  })

  it('should use correct line styles', () => {
    createTestEXPMALayer().paint(createContextWithState(ctx, createTestEXPMARenderState()))

    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should draw from index 0 (dense array)', () => {
    const state = createTestEXPMARenderState({
      series: Array.from({ length: 10 }, (_, i) => ({ fast: 100 + i, slow: 100 + i * 0.5 })),
    })

    createTestEXPMALayer().paint(
      createContextWithState(ctx, state, { range: { start: 0, end: 10 } }),
    )

    expect(ctx.beginPath).toHaveBeenCalled()
  })
})
