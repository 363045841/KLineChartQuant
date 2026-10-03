// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Chart } from '../../chart'
import { InteractionController } from '../interaction'
import {
  createChartStub,
  createInteractionBars,
  createMockInteractionState,
} from './helpers/interactionTestKit'

describe('horizontal pan inertia', () => {
  let time: number
  let nextFrame: number
  let frames: Map<number, FrameRequestCallback>

  beforeEach(() => {
    time = 0
    nextFrame = 0
    frames = new Map()
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function step(dt = 16) {
    time += dt
    const callbacks = [...frames.values()]
    frames.clear()
    for (const callback of callbacks) callback(time)
  }

  function scene(dpr = 1, pointerType = 'mouse') {
    const chart = createChartStub({
      dpr,
      plotWidth: 300,
      plotHeight: 160,
      data: createInteractionBars(200),
      scrollLeft: 300,
    })
    const state = createMockInteractionState()
    const interaction = new InteractionController(chart as unknown as Chart, state)
    const pointer = (x: number) =>
      ({
        clientX: x,
        clientY: 10,
        pointerId: 1,
        pointerType,
        isPrimary: true,
        timeStamp: time,
      }) as PointerEvent
    const fling = (direction = -1, dragDistance = 60) => {
      interaction.onPointerDown(pointer(150))
      time += 40
      interaction.onPointerMove(pointer(150 + direction * dragDistance))
      time += 10
      interaction.onPointerUp(pointer(150 + direction * dragDistance))
    }
    const scroll = () => chart.kernel.viewport.readonly.scrollLeftLogical.peek()
    return { chart, state, interaction, pointer, fling, scroll }
  }

  it.each([-1, 1])('continues in the drag direction %s and decelerates to rest', (direction) => {
    const { interaction, fling, scroll } = scene()
    fling(direction)
    const released = scroll()
    expect(interaction.isPointerDown()).toBe(true)
    step()
    const first = scroll()
    step()
    const second = scroll()
    expect((first - released) * -direction).toBeGreaterThan(0)
    expect(Math.abs(second - first)).toBeLessThanOrEqual(Math.abs(first - released))
    for (let i = 0; i < 100 && frames.size; i++) step()
    expect(frames.size).toBe(0)
    expect(interaction.isPointerDown()).toBe(false)
    expect(interaction.hasPendingHover()).toBe(true)
  })

  it.each([1, 1.25, 1.5, 2, 3])('aligns inertial scrolling to physical pixels at DPR=%s', (dpr) => {
    const { fling, scroll } = scene(dpr)
    fling()
    for (let i = 0; i < 10; i++) {
      step()
      expect(scroll() * dpr).toBeCloseTo(Math.round(scroll() * dpr), 8)
    }
  })

  it('does not start after holding still before release', () => {
    const { interaction, pointer } = scene()
    interaction.onPointerDown(pointer(150))
    time += 40
    interaction.onPointerMove(pointer(90))
    time += 120
    interaction.onPointerUp(pointer(90))
    expect(frames.size).toBe(0)
  })

  it('does not start for a slow drag', () => {
    const { interaction, pointer } = scene()
    interaction.onPointerDown(pointer(150))
    time += 80
    interaction.onPointerMove(pointer(145))
    interaction.onPointerUp(pointer(145))
    expect(frames.size).toBe(0)
  })

  it('stops at the current view boundary', () => {
    const { chart, fling, scroll } = scene()
    const left = chart.kernel.viewport.readonly.viewSnapshot.peek().scrollBounds.min
    chart.kernel.viewport.actions.scrollToLogical(600)
    fling(1, 600)
    for (let i = 0; i < 100 && frames.size; i++) step()
    expect(scroll()).toBe(left)
    expect(frames.size).toBe(0)
  })

  it.each(['press', 'reset', 'stop'] as const)('cancels pending animation on %s', (action) => {
    const { interaction, pointer, fling, scroll } = scene()
    fling()
    if (action === 'press') interaction.onPointerDown(pointer(100))
    else if (action === 'reset') interaction.reset()
    else interaction.stopInertia()
    const stopped = scroll()
    step()
    expect(scroll()).toBe(stopped)
    expect(frames.size).toBe(0)
  })

  it('does not fling cancelled pointer sessions', () => {
    const { interaction, pointer } = scene()
    interaction.onPointerDown(pointer(150))
    time += 40
    interaction.onPointerMove(pointer(90))
    interaction.onPointerCancel(pointer(90))
    expect(frames.size).toBe(0)
  })

  it('continues touch panning without restoring mouse hover', () => {
    const { interaction, fling, scroll } = scene(1, 'touch')
    fling()
    const released = scroll()
    for (let i = 0; i < 100 && frames.size; i++) step()
    expect(scroll()).toBeGreaterThan(released)
    expect(frames.size).toBe(0)
    expect(interaction.hasPendingHover()).toBe(false)
  })

  it('does not overwrite an external navigation update', () => {
    const { chart, fling, scroll } = scene()
    fling()
    chart.kernel.viewport.actions.scrollToLogical(500)
    step()
    expect(scroll()).toBe(500)
    expect(frames.size).toBe(0)
  })

  it('keeps the fling after normal capture release', () => {
    const { interaction, fling } = scene()
    fling()
    interaction.onLostPointerCapture({ pointerId: 1 } as PointerEvent)
    expect(frames.size).toBe(1)
    expect(interaction.isPointerDown()).toBe(true)
  })
  it('suppresses hover while the fling is running', () => {
    const { interaction, fling } = scene()
    fling()
    interaction.flushPendingHover()
    expect(interaction.crosshairPos).toBeNull()
    expect(frames.size).toBe(1)
  })
})
