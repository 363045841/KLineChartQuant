// 图表上下文投影：把 Core ChartAgentController 快照转成 UI 与模型共享的最小上下文项。

import { formatDateTimeInTimeZone } from '@363045841yyt/klinechart-core'
import type { ChartAgentController } from '@363045841yyt/klinechart-core/controllers'
import type { AgentContextItem } from '../../../agent-contracts.js'

/** 从 Core 快照投影 UI 与模型共享的最小上下文。 */
export function projectContextItems(
  agent: ChartAgentController | null | undefined,
): ReadonlyArray<AgentContextItem> {
  const context = agent?.context()
  if (!context) return Object.freeze([])
  const items: AgentContextItem[] = []
  if (context.symbol) {
    items.push({
      kind: 'chart-symbol',
      value: { symbol: context.symbol, name: context.symbolName },
    })
  }
  if (context.visibleRange) {
    items.push({
      kind: 'selected-time-range',
      value: {
        from: formatDateTimeInTimeZone(context.visibleRange.from, context.timezone ?? 'UTC'),
        to: formatDateTimeInTimeZone(context.visibleRange.to, context.timezone ?? 'UTC'),
      },
    })
  }
  if (context.selectedKLineBars) {
    items.push({
      kind: 'selected-kline-bars',
      value: { content: context.selectedKLineBars },
    })
  }
  if (context.drawingSelection) {
    items.push({
      kind: 'drawing-selection',
      value: {
        selectedIds: [...context.drawingSelection.selectedIds],
        drawings: context.drawingSelection.drawings.map((drawing) => ({
          id: drawing.id,
          kind: drawing.kind,
          paneId: drawing.paneId,
          visible: drawing.visible,
          locked: drawing.locked,
          zIndex: drawing.zIndex,
          anchors: drawing.anchors.map((anchor) => ({ ...anchor })),
          style: Object.fromEntries(
            Object.entries(drawing.style).filter(
              (entry): entry is [string, string | number] => entry[1] !== undefined,
            ),
          ),
        })),
      },
    })
  }
  return Object.freeze(
    items.map((item) => Object.freeze({ ...item, value: Object.freeze(item.value) })),
  )
}
