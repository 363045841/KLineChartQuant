import type { RendererPluginWithHost } from '../../../../foundation/plugin/index'

import { createIndicatorScaleRendererPlugin } from './indicator_scale'

const YI = 1e8
const WAN = 1e4

/** 将成交量刻度按量级格式化，避免小额成交量显示为 0.00B。 */
export function formatVolumeScaleLabel(value: number): string {
  if (Math.abs(value) >= YI) return `${(value / YI).toFixed(2)}B`
  if (Math.abs(value) >= WAN) return `${(value / WAN).toFixed(2)}万`
  return value.toFixed(2)
}

/**
 * 创建成交量刻度渲染器插件
 */
export function createVolumeScaleRendererPlugin(options: {
  axisWidth: number
  paneId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
  return createIndicatorScaleRendererPlugin({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    indicatorKey: 'volume',
    label: 'VOL',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
    formatTickLabel: formatVolumeScaleLabel,
    formatCrosshairLabel: formatVolumeScaleLabel,
  })
}
