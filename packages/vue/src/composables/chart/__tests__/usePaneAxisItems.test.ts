/** 轴入口订阅 Core 几何，尺寸与轴宽变化不依赖 DOM 或配置重新发布。 */
import type { PaneGeometry } from '@363045841yyt/klinechart-core/controllers'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import { expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { createMockChartController } from '../../../__tests__/_mockController.js'
import { usePaneAxisItems } from '../usePaneAxisItems.js'

it('bridges Core geometry and releases its subscription with the scope', () => {
  const geometry = createSignal<ReadonlyArray<PaneGeometry>>([
    { id: 'main', top: 0, height: 420, primaryAxisWidth: 72 },
    { id: 'sub', top: 420, height: 180, primaryAxisWidth: 48 },
  ])
  const controller = { ...createMockChartController(), paneGeometry: geometry }
  const scope = effectScope()
  const items = scope.run(() => usePaneAxisItems(shallowRef(controller)))!
  expect(items.value).toEqual(geometry.peek())
  const layout = controller.paneLayout.peek()
  geometry.set([{ id: 'main', top: 0, height: 350, primaryAxisWidth: 56 }])
  expect(items.value).toEqual(geometry.peek())
  expect(controller.paneLayout.peek()).toBe(layout)
  scope.stop()
  geometry.set([])
  expect(items.value).toHaveLength(1)
})
