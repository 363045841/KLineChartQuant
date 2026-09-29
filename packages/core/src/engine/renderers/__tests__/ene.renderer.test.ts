import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ENERenderState } from '@/core/indicators/state/eneState'
import {
  createMockCanvasContext,
  createMockRenderContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { resolveThemeColors } from '@/foundation/tokens'
import type { RenderContext } from '@/plugin'
import { createENELayer } from '../Indicator/ene'

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const ENE_INSTANCE_ID = 'inst-ene'

/** 构造测试用 ENERenderState。 */
function createTestENERenderState(overrides: Partial<ENERenderState> = {}): ENERenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) =>
      i < 9 ? undefined : { upper: 111 + i * 0.1, middle: 100 + i * 0.1, lower: 89 + i * 0.1 },
    ),
    params: {
      period: 10,
      deviation: 11,
    },
    visibleMin: 89,
    visibleMax: 122,
    ...overrides,
  }
}

/** 构造绑定固定实例身份的 ENE Layer。 */
function createTestENELayer() {
  return createENELayer({ instanceId: ENE_INSTANCE_ID })
}

/** 构造携带实例投影的帧上下文。 */
function createContextWithState(
  ctx: CanvasRenderingContext2D,
  state?: ENERenderState,
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return createMockRenderContext({
    ctx,
    indicatorStateReader: {
      get: <T>(key: string) => (key === ENE_INSTANCE_ID ? (state as T) : undefined),
    },
    ...overrides,
  })
}

describe('createENELayer', () => {
  it('should expose the ene layer identity', () => {
    const layer = createTestENELayer()

    expect(layer.id).toBe('plugin:ene')
    expect(layer.role).toBe('primary')
    expect(layer.pane).toBe('main')
    expect(layer.visible).toBe(true)
  })
})

describe('ENE layer paint', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    createTestENELayer().paint(createContextWithState(ctx, undefined))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestENERenderState({ visibleMin: Infinity, visibleMax: -Infinity })

    createTestENELayer().paint(createContextWithState(ctx, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    createTestENELayer().paint(createContextWithState(ctx, createTestENERenderState()))

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should not draw band fill', () => {
    createTestENELayer().paint(createContextWithState(ctx, createTestENERenderState()))

    expect(ctx.fill).not.toHaveBeenCalled()
    expect(ctx.closePath).not.toHaveBeenCalled()
  })

  it('should draw all three lines (upper, middle, lower)', () => {
    createTestENELayer().paint(createContextWithState(ctx, createTestENERenderState()))

    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should use correct line styles', () => {
    createTestENELayer().paint(createContextWithState(ctx, createTestENERenderState()))

    expect(ctx.lineWidth).toBe(1)
    expect(ctx.lineJoin).toBe('round')
    expect(ctx.lineCap).toBe('round')
  })

  it('should use theme colors', () => {
    createTestENELayer().paint(createContextWithState(ctx, createTestENERenderState()))

    // 最后绘制下轨，strokeStyle 应取 light 主题的 ene.lower
    expect(ctx.strokeStyle).toBe(resolveThemeColors('light').ene.lower)
  })

  it('should skip undefined values at start of series', () => {
    const state = createTestENERenderState({
      series: Array.from({ length: 15 }, (_, i) =>
        i < 9 ? undefined : { upper: 111, middle: 100, lower: 89 },
      ),
    })

    const context = createContextWithState(ctx, state, { range: { start: 0, end: 15 } })

    expect(() => createTestENELayer().paint(context)).not.toThrow()
    expect(ctx.stroke).toHaveBeenCalled()
  })
})
