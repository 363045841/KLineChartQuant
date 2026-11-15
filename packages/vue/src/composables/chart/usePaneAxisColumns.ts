/** 轴设置入口按列生成：横向位置与轴身份全部来自 Core 已提交的轴列几何。 */
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import { computed, type ComputedRef, type Ref } from 'vue'
import { usePaneAxisItems } from './usePaneAxisItems.js'

/** 一条轴列的轴身份与横向位置；纵向分区由宿主按 Pane 边界决定。 */
export interface PaneAxisColumnItem {
  readonly paneId: string
  readonly axisId: string
  /** 轴列在 Pane 轴区内的左偏移与宽度（CSS px） */
  readonly left: number
  readonly width: number
}

/** 展平各 Pane 的轴列，让每个入口绑定自己那一列。 */
export function usePaneAxisColumns(
  controller: Ref<ChartController | null>,
): ComputedRef<ReadonlyArray<PaneAxisColumnItem>> {
  const geometry = usePaneAxisItems(controller)
  return computed(() =>
    geometry.value.flatMap((pane) =>
      pane.axisColumns.map((column) => ({
        paneId: pane.id,
        axisId: column.axisId,
        left: column.left,
        width: column.width,
      })),
    ),
  )
}
