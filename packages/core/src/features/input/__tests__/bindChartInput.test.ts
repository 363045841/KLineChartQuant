// @vitest-environment jsdom
/** 验证 DOM 输入绑定：指针转发与拦截、钩子顺序、滚轮、坐标轴命中区与释放。 */

import { describe, expect, it, vi } from 'vitest'

import type { DrawingControllerCallbacks } from '../../../controllers/types.js'
import { bindChartInput, type ChartInputController } from '../bindChartInput.js'

// jsdom 未实现 PointerEvent；绑定只依赖事件类型与派发，MouseEvent 足以覆盖。
function pointer(type: string, init: MouseEventInit = {}): PointerEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...init }) as PointerEvent
}

function createController() {
  return {
    handlePointerEvent: vi.fn<ChartInputController['handlePointerEvent']>(() => false),
    handleWheelEvent: vi.fn<ChartInputController['handleWheelEvent']>(),
  } satisfies ChartInputController
}

describe('bindChartInput', () => {
  it('forwards every pointer phase on the surface with the intercept callbacks', () => {
    const controller = createController()
    const surface = document.createElement('div')
    const intercept: DrawingControllerCallbacks = { onPointerDown: () => true }
    bindChartInput(controller, { surface }, { intercept })

    const types = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointerleave',
      'pointercancel',
      'lostpointercapture',
    ]
    for (const type of types) surface.dispatchEvent(pointer(type))

    expect(controller.handlePointerEvent.mock.calls.map(([e]) => e.type)).toEqual(types)
    for (const [, callbacks] of controller.handlePointerEvent.mock.calls) {
      expect(callbacks).toBe(intercept)
    }
  })

  it('receives events bubbling from children such as the canvas layer', () => {
    const controller = createController()
    const surface = document.createElement('div')
    const canvas = document.createElement('canvas')
    surface.append(canvas)
    bindChartInput(controller, { surface })

    canvas.dispatchEvent(pointer('pointerdown'))
    expect(controller.handlePointerEvent).toHaveBeenCalledOnce()
  })

  it('runs beforePointer and afterPointer around the controller and honours a veto', () => {
    const controller = createController()
    const surface = document.createElement('div')
    const order: string[] = []
    controller.handlePointerEvent.mockImplementation(() => {
      order.push('controller')
      return false
    })
    bindChartInput(
      controller,
      { surface },
      {
        beforePointer: (e) => {
          order.push(`before:${e.type}`)
          return e.type !== 'pointerleave'
        },
        afterPointer: (e) => {
          order.push(`after:${e.type}`)
        },
      },
    )

    surface.dispatchEvent(pointer('pointerup'))
    surface.dispatchEvent(pointer('pointerleave'))

    expect(order).toEqual([
      'before:pointerup',
      'controller',
      'after:pointerup',
      'before:pointerleave',
    ])
  })

  it('forwards axis pointer events without intercepts or hooks', () => {
    const controller = createController()
    const surface = document.createElement('div')
    const axis = document.createElement('div')
    const beforePointer = vi.fn()
    bindChartInput(
      controller,
      { surface, axisTargets: [axis] },
      { beforePointer, intercept: { onPointerDown: () => true } },
    )

    axis.dispatchEvent(pointer('pointerdown'))

    expect(controller.handlePointerEvent).toHaveBeenCalledOnce()
    expect(controller.handlePointerEvent.mock.calls[0]).toHaveLength(1)
    expect(beforePointer).not.toHaveBeenCalled()
  })

  it('cancels default wheel scrolling on the wheel target and forwards it', () => {
    const controller = createController()
    const parent = document.createElement('div')
    const surface = document.createElement('div')
    parent.append(surface)
    bindChartInput(controller, { surface, wheelTarget: parent })

    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 })
    surface.dispatchEvent(wheel)

    expect(wheel.defaultPrevented).toBe(true)
    expect(controller.handleWheelEvent).toHaveBeenCalledWith(wheel)
  })

  it('sets touch-action on the surface and restores everything on dispose', () => {
    const controller = createController()
    const surface = document.createElement('div')
    const axis = document.createElement('div')
    surface.style.touchAction = 'pan-y'
    const dispose = bindChartInput(controller, { surface, axisTargets: [axis] })
    expect(surface.style.touchAction).toBe('none')

    dispose()
    dispose()
    surface.dispatchEvent(pointer('pointerdown'))
    axis.dispatchEvent(pointer('pointerdown'))
    surface.dispatchEvent(new WheelEvent('wheel', { cancelable: true }))

    expect(surface.style.touchAction).toBe('pan-y')
    expect(controller.handlePointerEvent).not.toHaveBeenCalled()
    expect(controller.handleWheelEvent).not.toHaveBeenCalled()
  })
})
