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
  registry.register(createChartCommands({ controller: () => controller, openPalette: vi.fn() }))
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
})
