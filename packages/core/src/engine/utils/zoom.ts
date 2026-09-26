import { isTimeSharePeriod } from '../../foundation/types/chartPeriod.js'
import { futureBarCount } from '../viewport/viewport.js'
import { getPhysicalKLineConfig } from './klineConfig.js'

/**
 * 缩放计算纯函数
 * 无副作用、无 DOM 访问，供 Vue 层直接调用
 */

export interface ZoomConfigBase {
  minKWidth: number
  maxKWidth: number
  zoomLevelCount: number
}

export interface ZoomConfig extends ZoomConfigBase {
  dpr: number
  /** K 线数据条数（用于计算缩放后内容宽度） */
  dataLength: number
  /** 视口绘图区宽度（= leftLoadBufferWidth = viewWidth，用于内容宽度计算） */
  plotWidth: number
  /** 容器总宽度（用于 maxScroll 裁剪） */
  clientWidth: number
  /** 未来区屏数：缩放后的 maxScroll 裁剪需含未来区槽位；缺省不加 */
  futureScreens?: number
}

export interface ZoomResult {
  targetLevel: number
  newKWidth: number
  newKGap: number
  newScrollLeft: number
  /** 裁剪后的 DOM scrollLeft（已用新 kWidth/kGap 计算内容宽度） */
  newDomScrollLeft: number
}

const PHYS_K_GAP_MAX = 3

/** 尾部预留 K 线槽位数（与 ScrollCompensator 的 SCROLL_TRAILING_SLOTS=30 语义对齐） */
const TRAILING_SLOTS = 30

/** 将缩放级别转换为 K 线宽度（逻辑像素） */
export function zoomLevelToKWidth(level: number, config: ZoomConfigBase): number {
  const t = (level - 1) / (config.zoomLevelCount - 1)
  return config.minKWidth + t * (config.maxKWidth - config.minKWidth)
}

/** 根据K线宽度和DPR推导间隙（逻辑像素），K线越窄间距越小 */
export function kGapFromKWidth(kWidth: number, dpr: number): number {
  const kWidthPx = Math.round(kWidth * dpr)
  const kGapPx = Math.max(1, Math.min(PHYS_K_GAP_MAX, Math.round(kWidthPx * 0.6)))
  return kGapPx / dpr
}

export interface DeriveKGapInput {
  kWidth: number
  dpr: number
  period: string
}

/**
 * 图表内部 kGap 派生规则。
 *
 * @remarks kGap 不是可写业务状态。分时固定 1 物理像素间隙；
 * 离散 K 线周期走 kGapFromKWidth。
 */
export function deriveKGap(input: DeriveKGapInput): number {
  const dpr = input.dpr > 0 ? input.dpr : 1
  if (isTimeSharePeriod(input.period)) {
    return 1 / dpr
  }
  return kGapFromKWidth(input.kWidth, dpr)
}

/**
 * 缩放一级（+1 放大 / -1 缩小）
 * 返回新状态或 null（已达边界）
 */
export function computeZoom(
  delta: number,
  mouseX: number,
  scrollLeft: number,
  currentLevel: number,
  currentKWidth: number,
  currentKGap: number,
  config: ZoomConfig,
): ZoomResult | null {
  const targetLevel = Math.max(1, Math.min(config.zoomLevelCount, currentLevel + delta))
  if (targetLevel === currentLevel) return null

  const newKWidth = zoomLevelToKWidth(targetLevel, config)
  const newKGap = kGapFromKWidth(newKWidth, config.dpr)

  const oldConfig = getPhysicalKLineConfig(currentKWidth, currentKGap, config.dpr)
  const newConfig = getPhysicalKLineConfig(newKWidth, newKGap, config.dpr)
  const anchorWorldPx = Math.round((scrollLeft + mouseX) * config.dpr)
  const anchorSlotFloat = (anchorWorldPx - oldConfig.startXPx) / oldConfig.unitPx
  const newAnchorWorldPx = newConfig.startXPx + anchorSlotFloat * newConfig.unitPx
  const newScrollLeft = newAnchorWorldPx / config.dpr - mouseX

  // 缩放后的内容宽度与 maxScroll 需含未来区槽位，否则拖入未来区后缩放会被拉回数据右缘
  const futureBars = futureBarCount(
    config.plotWidth,
    config.dpr,
    newConfig.unitPx,
    config.futureScreens ?? 0,
  )
  const trailingSlots = Math.max(TRAILING_SLOTS, futureBars)
  const dataPlotWidth =
    (newConfig.startXPx + (config.dataLength + trailingSlots) * newConfig.unitPx) / config.dpr
  const newContentWidth = config.plotWidth + Math.max(dataPlotWidth, config.plotWidth)
  const maxScroll = Math.max(0, newContentWidth - config.clientWidth)

  const domScrollLeft = newScrollLeft + config.plotWidth
  const newDomScrollLeft =
    Math.round(Math.max(0, Math.min(domScrollLeft, maxScroll)) * config.dpr) / config.dpr

  return { targetLevel, newKWidth, newKGap, newScrollLeft, newDomScrollLeft }
}

/**
 * 缩放到指定级别
 * 返回新状态或 null（级别不变或无效）
 */
export function computeZoomToLevel(
  targetLevel: number,
  anchorX: number,
  scrollLeft: number,
  currentLevel: number,
  currentKWidth: number,
  currentKGap: number,
  config: ZoomConfig,
): ZoomResult | null {
  const clamped = Math.max(1, Math.min(config.zoomLevelCount, Math.round(targetLevel)))
  const delta = clamped - currentLevel
  if (delta === 0) return null
  return computeZoom(delta, anchorX, scrollLeft, currentLevel, currentKWidth, currentKGap, config)
}
