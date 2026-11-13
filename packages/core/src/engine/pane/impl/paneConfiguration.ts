/** Pane 配置比较：领域写入与状态快照共用，不依赖像素布局或 DOM。 */
import type { PaneSpec } from '../types.js'

/** 比较完整配置及显示顺序，避免重复提交触发重投影和自动保存比较。 */
export function paneSpecsEqual(
  left: ReadonlyArray<PaneSpec>,
  right: ReadonlyArray<PaneSpec>,
): boolean {
  return (
    left.length === right.length &&
    left.every((pane, index) => {
      const other = right[index]!
      return (
        pane.id === other.id &&
        pane.ratio === other.ratio &&
        pane.visible === other.visible &&
        pane.minHeightPx === other.minHeightPx &&
        pane.role === other.role &&
        capabilitiesEqual(pane.capabilities, other.capabilities)
      )
    })
  )
}

/** 能力按字段比较，调用方对象的属性插入顺序不影响语义。 */
function capabilitiesEqual(
  left: PaneSpec['capabilities'],
  right: PaneSpec['capabilities'],
): boolean {
  return (
    left?.showPriceAxisTicks === right?.showPriceAxisTicks &&
    left?.showCrosshairPriceLabel === right?.showCrosshairPriceLabel &&
    left?.candleHitTest === right?.candleHitTest &&
    left?.supportsPriceTranslate === right?.supportsPriceTranslate
  )
}
