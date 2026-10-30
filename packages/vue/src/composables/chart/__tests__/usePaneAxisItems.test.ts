/** 已恢复配置保持不变时，divider 所用几何仍随实际窗格表面更新。 */
import { effectScope, nextTick, shallowRef } from 'vue'
import { expect, it } from 'vitest'
import type { PaneSpec } from '@363045841yyt/klinechart-core/controllers'
import { usePaneAxisItems } from '../usePaneAxisItems.js'

it('reads initial panes and updates their geometry without another configuration publication', async () => {
  const layer = document.createElement('div')
  const panes = shallowRef<ReadonlyArray<PaneSpec>>([
    { id: 'main', ratio: 0.7 }, { id: 'sub', ratio: 0.3 },
  ])
  const canvases = panes.value.map((pane, index) => {
    const canvas = document.createElement('canvas')
    canvas.id = `${pane.id}-rightAxis`
    canvas.className = 'right-axis'
    canvas.style.top = `${index * 420}px`
    canvas.style.height = `${index === 0 ? 420 : 180}px`
    Object.defineProperties(canvas, {
      offsetTop: { get: () => parseInt(canvas.style.top) },
      offsetHeight: { get: () => parseInt(canvas.style.height) },
    })
    layer.append(canvas)
    return canvas
  })
  const scope = effectScope()
  try {
    const items = scope.run(() => usePaneAxisItems(shallowRef(layer), panes, shallowRef(0)))!
    expect(items.value).toEqual([{ id: 'main', top: 0, height: 420 }, { id: 'sub', top: 420, height: 180 }])
    canvases[0]!.style.height = '350px'
    canvases[1]!.style.top = '350px'
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    await nextTick()
    expect(items.value[0]?.height).toBe(350)
    expect(items.value[1]?.top).toBe(350)
    expect(panes.value[0]?.ratio).toBe(0.7)
    canvases[1]!.remove()
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    await nextTick()
    expect(items.value).toHaveLength(1)
  } finally {
    scope.stop()
  }
})
