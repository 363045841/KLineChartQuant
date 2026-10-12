/**
 * 图表命令目录测试：撤销/重做的可用性门控、快捷键绑定，以及与 Agent 工具同源的
 * controller 动作调用。
 */
import { createCommandRegistry } from '@363045841yyt/klinechart-core'
import { describe, expect, it, vi } from 'vitest'
import { createMockChartController } from '../../../__tests__/_mockController.js'
import { createChartCommands } from '../chartCommands.js'

const inChart = { withinScope: true, editable: false }

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

/** 用 win 平台建注册表并注册图表命令。 */
function registryFor(controller: ReturnType<typeof createMockChartController>) {
  const registry = createCommandRegistry({ platform: 'win' })
  registry.register(
    createChartCommands({
      controller: () => controller,
      openPalette: vi.fn(),
      toggleFullscreen: vi.fn(),
      openSettings: vi.fn(),
      screenshot: vi.fn(),
    }),
  )
  return registry
}

describe('createChartCommands', () => {
  it('gates undo/redo on controller history availability', () => {
    const controller = createMockChartController()
    const registry = registryFor(controller)
    expect(registry.resolveKeyboardEvent(key('z', { ctrlKey: true }), inChart)).toBeNull()
    controller._setDrawingHistory(true, false)
    expect(registry.resolveKeyboardEvent(key('z', { ctrlKey: true }), inChart)?.id).toBe(
      'drawing.undo',
    )
    expect(registry.resolveKeyboardEvent(key('y', { ctrlKey: true }), inChart)).toBeNull()
  })

  it('binds the standard redo combos', () => {
    const controller = createMockChartController()
    controller._setDrawingHistory(false, true)
    const registry = registryFor(controller)
    expect(registry.resolveKeyboardEvent(key('y', { ctrlKey: true }), inChart)?.id).toBe(
      'drawing.redo',
    )
    expect(
      registry.resolveKeyboardEvent(key('Z', { ctrlKey: true, shiftKey: true }), inChart)?.id,
    ).toBe('drawing.redo')
  })

  it('runs the same controller action an Agent tool would', async () => {
    const controller = createMockChartController()
    controller._setDrawingHistory(true, true)
    const registry = registryFor(controller)
    const undo = vi.spyOn(controller, 'undoDrawing')
    const redo = vi.spyOn(controller, 'redoDrawing')
    await registry.execute('drawing.undo')
    await registry.execute('drawing.redo')
    expect(undo).toHaveBeenCalledOnce()
    expect(redo).toHaveBeenCalledOnce()
  })

  it('binds the view commands to TradingView-style keys', () => {
    const registry = registryFor(createMockChartController())
    expect(registry.resolveKeyboardEvent(key('ArrowUp', { ctrlKey: true }), inChart)?.id).toBe(
      'view.zoomIn',
    )
    expect(registry.resolveKeyboardEvent(key('ArrowDown', { ctrlKey: true }), inChart)?.id).toBe(
      'view.zoomOut',
    )
    expect(registry.resolveKeyboardEvent(key('ArrowLeft'), inChart)?.id).toBe('view.moveLeft')
    expect(registry.resolveKeyboardEvent(key('ArrowRight'), inChart)?.id).toBe('view.moveRight')
    expect(registry.resolveKeyboardEvent(key('r', { altKey: true }), inChart)?.id).toBe(
      'view.reset',
    )
    expect(registry.resolveKeyboardEvent(key('F', { shiftKey: true }), inChart)?.id).toBe(
      'view.fullscreen',
    )
  })

  it('drives viewport actions through controller methods', async () => {
    const controller = createMockChartController()
    const registry = registryFor(controller)
    const zoomIn = vi.spyOn(controller, 'zoomIn')
    const zoomOut = vi.spyOn(controller, 'zoomOut')
    const scrollByBars = vi.spyOn(controller, 'scrollByBars')
    const resetChart = vi.spyOn(controller, 'resetChart')
    await registry.execute('view.zoomIn')
    await registry.execute('view.zoomOut')
    await registry.execute('view.moveLeft')
    await registry.execute('view.moveRight')
    await registry.execute('view.reset')
    expect(zoomIn).toHaveBeenCalledOnce()
    expect(zoomOut).toHaveBeenCalledOnce()
    expect(scrollByBars).toHaveBeenNthCalledWith(1, -1)
    expect(scrollByBars).toHaveBeenNthCalledWith(2, 1)
    expect(resetChart).toHaveBeenCalledOnce()
  })

  it('routes fullscreen to the host capability', async () => {
    const controller = createMockChartController()
    const toggleFullscreen = vi.fn()
    const registry = createCommandRegistry({ platform: 'win' })
    registry.register(
      createChartCommands({
        controller: () => controller,
        openPalette: vi.fn(),
        toggleFullscreen,
        openSettings: vi.fn(),
        screenshot: vi.fn(),
      }),
    )
    await registry.execute('view.fullscreen')
    expect(toggleFullscreen).toHaveBeenCalledOnce()
  })
})
