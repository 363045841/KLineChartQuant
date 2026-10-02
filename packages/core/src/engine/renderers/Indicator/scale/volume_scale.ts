import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'

import { createIndicatorScaleLayer } from './indicator_scale.js'

const BILLION = 1e9
const MILLION = 1e6
const THOUSAND = 1e3

/** 成交量统一按英文 K、M、B 单位格式化，供坐标轴和标题共用。 */
export function formatVolumeScaleLabel(value: number): string {
  if (Math.abs(value) >= BILLION) return `${(value / BILLION).toFixed(2)}B`
  if (Math.abs(value) >= MILLION) return `${(value / MILLION).toFixed(2)}M`
  if (Math.abs(value) >= THOUSAND) return `${(value / THOUSAND).toFixed(2)}K`
  return value.toFixed(2)
}

/**
 * 创建成交量刻度渲染器插件
 */
export function createVolumeScaleLayer(options: {
  axisWidth: number
  paneId: string
  instanceId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): Layer<RenderContext> {
  return createIndicatorScaleLayer({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    instanceId: options.instanceId,
    indicatorKey: 'volume',
    label: 'VOL',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
    formatTickLabel: formatVolumeScaleLabel,
    formatCrosshairLabel: formatVolumeScaleLabel,
  })
}
