/** 轴快捷入口只订阅 Core 几何，不观察或反读画布 DOM。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Ref } from 'vue'
import { useControllerSignal } from './useControllerSignal.js'

/** 返回已提交的可见 Pane 几何；Core 负责尺寸、主轴宽度和通知时机。 */
export function usePaneAxisItems(controller: Ref<ChartController | null>) {
  return useControllerSignal(
    controller,
    (chart) => chart.paneGeometry,
    () => [],
  )
}
