import type { RendererPluginWithHost } from '../../../../foundation/plugin/index'

import { createIndicatorScaleRendererPlugin } from './indicator_scale'

/**
 * 创建 MACD 刻度渲染器插件
 */
export function createMacdScaleRendererPlugin(options: {
  axisWidth: number
  paneId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
  return createIndicatorScaleRendererPlugin({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    indicatorKey: 'macd',
    label: 'MACD',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
