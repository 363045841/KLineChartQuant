import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BOLLRenderState } from '@/core/indicators/state/bollState'
import {
  createContextWithInstanceState,
  createMockCanvasContext,
} from '@/engine/__tests__/helpers/renderTestKit'
import { createBOLLLayer } from '../Indicator/boll'

if (typeof globalThis.Path2D === 'undefined') {
  class Path2DMock {
    moveTo = vi.fn()
    lineTo = vi.fn()
    closePath = vi.fn()
  }
  globalThis.Path2D = Path2DMock as unknown as typeof Path2D
}

/** 固定实例身份：renderer 只按 instanceId 寻址，不再依赖指标类型 state key。 */
const BOLL_INSTANCE_ID = 'inst-boll'

/** 构造测试用 BOLLRenderState。 */
function createTestBOLLState(overrides: Partial<BOLLRenderState> = {}): BOLLRenderState {
  return {
    timestamp: Date.now(),
    series: Array.from({ length: 100 }, (_, i) =>
      i < 19 ? undefined : { upper: 110 + i * 0.1, middle: 100 + i * 0.1, lower: 90 + i * 0.1 },
    ),
    params: {
      period: 20,
      multiplier: 2,
      showUpper: true,
      showMiddle: true,
      showLower: true,
    },
    visibleMin: 90,
    visibleMax: 120,
    ...overrides,
  }
}

/** 构造绑定固定实例身份的 BOLL Layer。 */
function createTestBOLLLayer() {
  return createBOLLLayer({
    paneId: 'main',
    instanceId: BOLL_INSTANCE_ID,
  })
}

describe('createBOLLLayer', () => {
  it('should expose the boll layer identity', () => {
    const layer = createTestBOLLLayer()

    expect(layer.id).toBe('plugin:boll')
    expect(layer.role).toBe('primary')
    expect(layer.pane).toBe('main')
    expect(layer.visible).toBe(true)
  })
})

describe('BOLL layer paint', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => {
    ctx = createMockCanvasContext()
  })

  it('should not draw when the instance projection is missing', () => {
    createTestBOLLLayer().paint(createContextWithInstanceState(ctx, BOLL_INSTANCE_ID, undefined))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should not draw when state has no valid data', () => {
    const state = createTestBOLLState({
      visibleMin: Infinity,
      visibleMax: -Infinity,
    })

    createTestBOLLLayer().paint(createContextWithInstanceState(ctx, BOLL_INSTANCE_ID, state))

    expect(ctx.beginPath).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('should save and restore context', () => {
    const state = createTestBOLLState()

    createTestBOLLLayer().paint(createContextWithInstanceState(ctx, BOLL_INSTANCE_ID, state))

    expect(ctx.save).toHaveBeenCalledTimes(1)
    expect(ctx.restore).toHaveBeenCalledTimes(1)
  })

  it('should paint the upper line when showUpper is true', () => {
    const state = createTestBOLLState({
      params: { ...createTestBOLLState().params, showUpper: true },
    })

    createTestBOLLLayer().paint(createContextWithInstanceState(ctx, BOLL_INSTANCE_ID, state))

    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('should not crash when series has undefined values', () => {
    const state = createTestBOLLState({
      series: Array.from({ length: 25 }, (_, i) =>
        i < 19 ? undefined : { upper: 110, middle: 100, lower: 90 },
      ),
    })

    const context = createContextWithInstanceState(ctx, BOLL_INSTANCE_ID, state, {
      range: { start: 0, end: 25 },
    })

    expect(() => createTestBOLLLayer().paint(context)).not.toThrow()
  })

  it('should not draw when the visible kline range is shorter than the period', () => {
    const state = createTestBOLLState({ params: { ...createTestBOLLState().params, period: 50 } })

    createTestBOLLLayer().paint(
      createContextWithInstanceState(ctx, BOLL_INSTANCE_ID, state, {
        range: { start: 0, end: 20 },
      }),
    )

    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})
