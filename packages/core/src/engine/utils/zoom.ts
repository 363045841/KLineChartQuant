/**
 * 缩放几何纯函数：缩放级别 ↔ K 线宽度派生、kGap 派生，以及手势锚点保持换算。
 *
 * @remarks
 * 本模块只负责坐标换算，不计算内容宽度与滚动上限：缩放后的滚动量交给
 * viewportState 的 maxScrollLeft 统一夹取（contentGeometry 是内容几何的唯一 SSOT）。
 *
 * 也刻意不感知数据条数：槽位网格对数据区与未来区是同一套（`startXPx + index * unitPx`），
 * 锚点只需要按指针所在的槽位换算。一旦在这里区分「这个槽位有没有数据」，
 * 就会分裂出第二种缩放行为——指针指向未来区时不再以该槽位为中心。
 */
import { isTimeSharePeriod } from '../../foundation/types/chartPeriod.js'
import { getPhysicalKLineConfig } from './klineConfig.js'

/** 缩放级别到 K 线宽度的映射参数。 */
export interface ZoomConfigBase {
  minKWidth: number
  maxKWidth: number
  zoomLevelCount: number
}

/** 一次缩放的输入。 */
export interface ZoomInput {
  /** 目标缩放级别（调用方负责合法性） */
  targetLevel: number
  /** 当前缩放级别 */
  currentLevel: number
  /** 当前 K 线宽度（逻辑像素） */
  currentKWidth: number
  /** 当前 K 线间隙（逻辑像素） */
  currentKGap: number
  /** 手势锚点在视口内的 X（逻辑像素）；无指针手势传视口左缘 */
  anchorViewportX: number
  /** 当前逻辑水平滚动量（相对左侧加载缓冲左缘） */
  scrollLeftLogical: number
  dpr: number
  config: ZoomConfigBase
}

/** 缩放结果。 */
export interface ZoomResult {
  targetLevel: number
  /** 新的逻辑水平滚动量；转 DOM 位置与上限夹取由 viewportState 负责 */
  scrollLeftLogical: number
}

/** kGap 的物理像素上下限：至少 1px，最多 3px。 */
const PHYS_K_GAP_MAX = 3

/** 将缩放级别转换为 K 线宽度（逻辑像素）。 */
export function zoomLevelToKWidth(level: number, config: ZoomConfigBase): number {
  const t = (level - 1) / (config.zoomLevelCount - 1)
  return config.minKWidth + t * (config.maxKWidth - config.minKWidth)
}

/** 按 K 线宽度与 DPR 推导间隙（逻辑像素），K 线越窄间距越小。 */
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
 * @remarks kGap 不是可写业务状态：分时固定 1 物理像素间隙，
 * 离散 K 线周期走 kGapFromKWidth。
 */
export function deriveKGap(input: DeriveKGapInput): number {
  const dpr = input.dpr > 0 ? input.dpr : 1
  if (isTimeSharePeriod(input.period)) return 1 / dpr
  return kGapFromKWidth(input.kWidth, dpr)
}

/** 将缩放级别取整并夹取到 [1, zoomLevelCount]。 */
export function clampZoomLevel(level: number, zoomLevelCount: number): number {
  return Math.max(1, Math.min(zoomLevelCount, Math.round(level)))
}

/**
 * 计算目标缩放级别下的新滚动量，锚点为指针所在的槽位。
 *
 * @param input - 缩放输入
 * @returns 新状态；目标级别与当前相同（已到边界）时返回 null
 */
export function computeZoom(input: ZoomInput): ZoomResult | null {
  if (input.targetLevel === input.currentLevel) return null

  const newKWidth = zoomLevelToKWidth(input.targetLevel, input.config)
  const newKGap = kGapFromKWidth(newKWidth, input.dpr)
  const oldGeometry = getPhysicalKLineConfig(input.currentKWidth, input.currentKGap, input.dpr)
  const newGeometry = getPhysicalKLineConfig(newKWidth, newKGap, input.dpr)

  // 锚点槽位在缩放前后保持同一屏幕位置：数据槽与未来槽走同一条公式，不区分有无数据。
  // 指针世界坐标对齐物理像素，与渲染栅格同量纲。
  const pointerWorldPx = Math.round((input.scrollLeftLogical + input.anchorViewportX) * input.dpr)
  const anchorSlot = (pointerWorldPx - oldGeometry.startXPx) / oldGeometry.unitPx
  const anchorWorldPx = newGeometry.startXPx + anchorSlot * newGeometry.unitPx

  return {
    targetLevel: input.targetLevel,
    scrollLeftLogical: anchorWorldPx / input.dpr - input.anchorViewportX,
  }
}
