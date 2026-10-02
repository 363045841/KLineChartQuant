/** 从 Core 轴画布读取各 Pane 的快捷入口布局。 */
import type { PaneSpec } from '@363045841yyt/klinechart-core/controllers'
import { computed, type Ref } from 'vue'

/** Pane 布局或画布尺寸变化时更新入口位置。 */
export function usePaneAxisItems(
  axisLayer: Ref<HTMLDivElement | null>,
  panes: Ref<ReadonlyArray<PaneSpec>>,
  layoutEpoch: Ref<number>,
) {
  return computed(() => {
    void layoutEpoch.value
    const layer = axisLayer.value
    if (!layer) return []
    const canvases = Array.from(layer.querySelectorAll<HTMLCanvasElement>('canvas.right-axis'))
    return panes.value
      .filter((pane) => pane.visible !== false)
      .flatMap((pane) => {
        const canvas = canvases.find((element) => element.id === `${pane.id}-rightAxis`)
        return canvas ? [{ id: pane.id, top: canvas.offsetTop, height: canvas.offsetHeight }] : []
      })
  })
}
