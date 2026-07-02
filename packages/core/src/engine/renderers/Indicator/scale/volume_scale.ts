import type { RendererPluginWithHost } from '../../../../plugin'

import { createIndicatorScaleRendererPlugin } from './indicator_scale'

const YI = 1e8

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
    formatTickLabel: (value) => `${(value / YI).toFixed(2)}B`,
    formatCrosshairLabel: (value) => `${(value / YI).toFixed(2)}B`,
  })
}
