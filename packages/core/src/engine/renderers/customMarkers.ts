import type {
  RendererPlugin,
  RenderContext,
  MarkerManagerLike,
} from '../../foundation/plugin/index'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../foundation/plugin/index'
import { drawShape, drawLabel, hitTestShape } from '../../features/semantic/drawShape'
import type { KLineData } from '../../foundation/types/price'
import { roundToPhysicalPixel } from '../../foundation/utils/pixelAlign'
import type { CustomMarkerEntity, CustomMarkerShape } from '../marker/registry'

/** 默认标记尺寸（相对于 K 线宽度的缩放因子） */
const DEFAULT_SIZE_SCALE = 1.2
/** 最大标记尺寸（像素） */
const MAX_MARKER_SIZE = 24
/** 最小标记尺寸（像素） */
const MIN_MARKER_SIZE = 6

/** 根据形状判断默认渲染位置（true = 上方，false = 下方） */
function isShapeRenderAboveKLine(shape: CustomMarkerShape): boolean {
  switch (shape) {
    case 'arrow_up':
    case 'flag':
      return true // 上涨信号、重要事件 → 默认在K线上方
    case 'arrow_down':
    case 'circle':
    case 'rectangle':
    case 'diamond':
    default:
      return false // 下跌信号、普通标记 → 默认在K线下方
  }
}

/**
 * 创建自定义标记渲染器插件
 * 负责渲染组件 props 中配置的 customMarkers
 */
export function createCustomMarkersRenderer(): RendererPlugin {
  return {
    name: 'customMarkers',
    version: '1.0.0',
    description: '自定义标记渲染器',
    debugName: '自定义标记',
    paneId: GLOBAL_PANE_ID,
    priority: RENDERER_PRIORITY.OVERLAY,

    draw(context: RenderContext): void {
      const {
        ctx,
        pane,
        data,
        range,
        scrollLeft,
        kWidth,
        kLineCenters,
        dpr,
        markerManager,
        zoomLevel,
      } = context
      if (!markerManager) return
      if ((zoomLevel ?? 1) < 2) return

      const customMarkers = markerManager.getCustomMarkers() as CustomMarkerEntity[]
      if (!customMarkers || customMarkers.length === 0) return

      const klineData = data as KLineData[]
      if (!klineData.length) return
      if (pane.role !== 'price') return

      ctx.save()
      ctx.translate(-scrollLeft, 0)

      for (const marker of customMarkers) {
        // 1. timestamp → index（直接在原数组上二分查找）
        const kIndex = findIndexByTimestamp(klineData, marker.timestamp)
        if (kIndex === -1) continue

        // 2. 检查是否在可视区域内
        if (kIndex < range.start || kIndex >= range.end) continue

        // 3. 计算像素坐标
        const posIndex = kIndex - range.start
        if (posIndex < 0 || posIndex >= kLineCenters.length) continue

        const pixelX = kLineCenters[posIndex]!

        const kData = klineData[kIndex]!
        const userSize = marker.style?.size
        const actualSize = calculateMarkerSize(kWidth, userSize)

        // 4. 判断标记渲染位置（上方或下方）
        // 如果 offset.y < 0，说明用户想渲染在上方；否则根据形状默认判断
        const isAboveKLine =
          (marker.offset?.y ?? 0) < 0
            ? true
            : (marker.offset?.y ?? 0) > 0
              ? false
              : isShapeRenderAboveKLine(marker.shape)

        // 5. 计算 Y 坐标
        let pixelY: number
        if (isAboveKLine) {
          // 在K线上方（基于 high）
          const highY = pane.yAxis.priceToY(kData.high)
          pixelY = highY - actualSize / 2 - 4 + (marker.offset?.y ?? 0)
        } else {
          // 在K线下方（基于 low）
          const lowY = pane.yAxis.priceToY(kData.low)
          pixelY = lowY + actualSize / 2 + 4 + (marker.offset?.y ?? 0)
        }

        // 6. 应用 X 偏移
        const finalX = pixelX + (marker.offset?.x ?? 0)
        const finalY = pixelY

        // 7. 物理像素对齐
        // X: kLineCenters 已对齐，直接使用；Y: priceToY 是浮点数，需要对齐
        const alignedX = finalX
        const alignedY = finalY
        // 确保 size*2*dpr 为偶数，使 size/2 在物理像素上为整数
        const alignedSize = (Math.round((actualSize * dpr) / 2) * 2) / dpr

        // 8. 绘制形状和标签（使用对齐后的坐标和尺寸）
        drawShape(ctx, marker.shape, alignedX, alignedY, alignedSize, marker.style || {})
        if (marker.label) {
          // 标签位置：标记在K线上方 → 文字在标记上方；标记在K线下方 → 文字在标记下方
          drawLabel(
            ctx,
            marker.label,
            alignedX,
            alignedY,
            alignedSize,
            marker.style || {},
            isAboveKLine,
          )
        }

        // 9. 记录位置和实际大小用于 hitTest（使用对齐后的值）
        markerManager.setCustomMarkerPosition(
          marker.id,
          alignedX - scrollLeft,
          alignedY,
          alignedSize,
          marker.shape,
        )
      }

      ctx.restore()
    },
  }
}

/**
 * 计算标记实际显示大小
 * @param kWidth K线宽度
 * @param userSize 用户配置的最大尺寸（可选）
 * @returns 实际显示大小（像素）
 */
function calculateMarkerSize(kWidth: number, userSize?: number): number {
  // 基于 kWidth 的基准大小
  const baseSize = kWidth * DEFAULT_SIZE_SCALE

  // 如果用户指定了最大尺寸，则限制不超过该值
  const maxSize = userSize ?? MAX_MARKER_SIZE

  // 最终大小：取基准大小和最大值中的较小者，但不小于最小值
  return Math.max(MIN_MARKER_SIZE, Math.min(baseSize, maxSize))
}

/**
 * 直接在有序数据上二分查找 timestamp 对应的 index
 * 避免每帧分配新数组
 */
function findIndexByTimestamp(data: KLineData[], targetTs: number): number {
  let left = 0
  let right = data.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midTs = data[mid]?.timestamp
    if (midTs === undefined) break

    if (midTs === targetTs) return mid
    if (midTs < targetTs) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return -1
}
