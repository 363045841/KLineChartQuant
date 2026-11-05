/** 缩放级别与绘制尺寸的纯派生；指针变换统一由 slotGrid 实现。 */
import { calcKWidthPx } from './klineConfig.js'

/** 主图 K 线宽度的默认上下限（逻辑像素）；上限需支撑足迹图展示价格行数字与横条细节。 */
export const DEFAULT_MIN_K_WIDTH = 1
export const DEFAULT_MAX_K_WIDTH = 200

/**
 * 控制器与直接创建 Chart 共用的默认缩放档位数量。
 * 档位数与 K 线宽度上限同步提高，放大到足迹图可读尺寸时仍保持每档约 2.5 逻辑像素的推进步长。
 */
export const DEFAULT_ZOOM_LEVEL_COUNT = 80

export interface ZoomConfigBase {
  minKWidth: number
  maxKWidth: number
  zoomLevelCount: number
}

/** 将合法缩放级别线性映射到配置的 K 线宽度。 */
export function zoomLevelToKWidth(level: number, config: ZoomConfigBase): number {
  const fraction = (level - 1) / (config.zoomLevelCount - 1)
  return config.minKWidth + fraction * (config.maxKWidth - config.minKWidth)
}

/**
 * 派生实际槽位间距：实体退化为 1 物理像素竖线时不保留间距，否则按密度系数缩放。
 * @param kWidth 实体宽度（逻辑像素）
 * @param dpr 设备像素比，用于判断实体是否已退化为单像素竖线
 * @param gapRatio 密度系数，来自 settings.klineDensity 的唯一映射
 * @returns 槽位间距（逻辑像素）
 */
export function kGapFromKWidth(kWidth: number, dpr: number, gapRatio: number): number {
  if (calcKWidthPx(kWidth, dpr) <= 1) return 0
  return Math.max(0, kWidth * gapRatio)
}

/** 仅限制尺寸级别，不限制指针槽位或世界滚动坐标。 */
export function clampZoomLevel(level: number, zoomLevelCount: number): number {
  return Math.max(1, Math.min(zoomLevelCount, Math.round(level)))
}
