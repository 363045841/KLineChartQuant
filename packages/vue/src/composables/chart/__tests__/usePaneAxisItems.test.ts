/** 轴入口订阅 Core 几何，尺寸与轴宽变化不依赖 DOM 或配置重新发布。 */

import { PRICE_AXIS_RANGE_MODE, ScaleType } from '@363045841yyt/klinechart-core/config'
import type { PaneGeometry } from '@363045841yyt/klinechart-core/controllers'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import { expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { createMockChartController } from '../../../__tests__/_mockController.js'
import { usePaneAxisItems } from '../usePaneAxisItems.js'

const configuration = {
  scaleType: ScaleType.Linear,
  rangeMode: PRICE_AXIS_RANGE_MODE.AUTO,
  baseValue: null,
}

it('bridges Core geometry and releases its subscription with the scope', () => {
  const geometry = createSignal<ReadonlyArray<PaneGeometry>>([
    {
      id: 'main',
      top: 0,
      height: 420,
      axisWidth: 72,
      axisColumns: [
        { axisId: 'object:price', left: 0, width: 40, configuration },
        { axisId: 'object:ma', left: 40, width: 32, configuration },
      ],
    },
    {
      id: 'sub',
      top: 420,
      height: 180,
      axisWidth: 48,
      axisColumns: [{ axisId: 'object:volume', left: 0, width: 48, configuration }],
    },
  ])
  const controller = { ...createMockChartController(), paneGeometry: geometry }
  const scope = effectScope()
  const items = scope.run(() => usePaneAxisItems(shallowRef(controller)))!
  expect(items.value).toEqual(geometry.peek())
  const layout = controller.paneLayout.peek()
  geometry.set([
    {
      id: 'main',
      top: 0,
      height: 350,
      axisWidth: 56,
      axisColumns: [{ axisId: 'object:price', left: 0, width: 56, configuration }],
    },
  ])
  expect(items.value).toEqual(geometry.peek())
  expect(controller.paneLayout.peek()).toBe(layout)
  scope.stop()
  geometry.set([])
  expect(items.value).toHaveLength(1)
})
