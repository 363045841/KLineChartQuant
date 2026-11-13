/** 多实例容器不能被首指标的 UI 投影截断，批量写入必须交给 Core 聚合命令。 */
import type {
  ChartController,
  IndicatorInstance,
  PaneSpec,
} from '@363045841yyt/klinechart-core/controllers'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { createMockChartController } from '../../../__tests__/_mockController.js'
import { useIndicatorManager } from '../useIndicatorManager.js'

/** 复用共享控制器替身，只声明本组测试需要的实例与容器差异。 */
function createManager() {
  const instances = createSignal<ReadonlyArray<IndicatorInstance>>([
    {
      id: 'a1',
      definitionId: 'A',
      label: 'A',
      name: 'A',
      role: 'sub',
      paneId: 'merged',
      ordinal: 0,
      params: {},
    },
    {
      id: 'b1',
      definitionId: 'B',
      label: 'B',
      name: 'B',
      role: 'sub',
      paneId: 'merged',
      ordinal: 1,
      params: {},
    },
    {
      id: 'a2',
      definitionId: 'A',
      label: 'A',
      name: 'A',
      role: 'sub',
      paneId: 'other',
      ordinal: 0,
      params: {},
    },
  ])
  const layout = createSignal<ReadonlyArray<PaneSpec>>([
    { id: 'merged', ratio: 0.25 },
    { id: 'main', ratio: 0.5 },
    { id: 'other', ratio: 0.25 },
  ])
  const controller: ChartController = {
    ...createMockChartController(),
    indicators: instances,
    paneLayout: layout,
    removeIndicatorsByDefinition: vi.fn(),
    clearPanes: vi.fn(),
    reorderPanes: vi.fn(() => true),
  }
  const scope = effectScope()
  const manager = scope.run(() => useIndicatorManager(shallowRef(controller)))!
  return { controller, manager, instances, stop: () => scope.stop() }
}

describe('useIndicatorManager pane and instance boundaries', () => {
  it('includes every merged instance and delegates definition removal without removing the pane', async () => {
    const fixture = createManager()
    try {
      expect(fixture.manager.subPanes.value[0]!.instances.map((instance) => instance.id)).toEqual([
        'a1',
        'b1',
      ])
      expect(fixture.manager.activeIndicators.value).toEqual(['A', 'B'])
      expect(fixture.manager.subActiveIndicators.value).toEqual(['A', 'B'])
      await fixture.manager.handleIndicatorToggle('A', false)
      expect(fixture.controller.removeIndicatorsByDefinition).toHaveBeenCalledExactlyOnceWith('A')
    } finally {
      fixture.stop()
    }
  })

  it('clears through one aggregate command and swaps pane identities around the main slot', () => {
    const fixture = createManager()
    try {
      fixture.manager.clearAllSubPanes()
      expect(fixture.controller.clearPanes).toHaveBeenCalledOnce()
      fixture.manager.moveSubPane('merged', 'down')
      expect(fixture.controller.reorderPanes).toHaveBeenCalledExactlyOnceWith([
        'other',
        'main',
        'merged',
      ])
    } finally {
      fixture.stop()
    }
  })
})
