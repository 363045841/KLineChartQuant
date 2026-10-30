/** 从 Core 轴画布读取各 Pane 的快捷入口布局。 */
import type { PaneSpec } from '@363045841yyt/klinechart-core/controllers'
import { computed, type Ref, shallowRef, watch } from 'vue'

/** Pane 布局或画布尺寸变化时更新入口位置。 */
export function usePaneAxisItems(
  axisLayer: Ref<HTMLDivElement | null>,
  panes: Ref<ReadonlyArray<PaneSpec>>,
  layoutEpoch: Ref<number>,
) {
  const geometryRevision = shallowRef(0)
  // 像素布局不是用户配置：观察 Core 已提交的 DOM 几何，不要求配置产生额外通知。
  watch(axisLayer, (layer, _previous, onCleanup) => {
    if (!layer) return
    const observer = new MutationObserver(() => { geometryRevision.value += 1 })
    observer.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
    onCleanup(() => observer.disconnect())
    geometryRevision.value += 1
  }, { immediate: true, flush: 'post' })
  return computed(() => {
    void geometryRevision.value
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
