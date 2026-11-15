/** 每个 Pane 的每条轴列生成一个入口，位置与轴身份全部来自 Core 几何。 */
import type { PaneGeometry } from '@363045841yyt/klinechart-core/controllers'
import { createSignal } from '@363045841yyt/klinechart-core/reactivity'
import { expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { createMockChartController } from '../../../__tests__/_mockController.js'
import { usePaneAxisColumns } from '../usePaneAxisColumns.js'

it('lists one entry per committed axis column', () => {
  const geometry = createSignal<ReadonlyArray<PaneGeometry>>([
    {
      id: 'main',
      top: 0,
      height: 420,
      axisWidth: 72,
      axisColumns: [
        { axisId: 'object:price', left: 0, width: 40 },
        { axisId: 'object:ma', left: 40, width: 32 },
      ],
    },
    {
      id: 'sub',
      top: 420,
      height: 180,
      axisWidth: 48,
      axisColumns: [{ axisId: 'object:volume', left: 0, width: 48 }],
    },
  ])
  const controller = { ...createMockChartController(), paneGeometry: geometry }
  const scope = effectScope()
  const items = scope.run(() => usePaneAxisColumns(shallowRef(controller)))!
  expect(items.value).toEqual([
    { paneId: 'main', axisId: 'object:price', left: 0, width: 40 },
    { paneId: 'main', axisId: 'object:ma', left: 40, width: 32 },
    { paneId: 'sub', axisId: 'object:volume', left: 0, width: 48 },
  ])
  scope.stop()
})
