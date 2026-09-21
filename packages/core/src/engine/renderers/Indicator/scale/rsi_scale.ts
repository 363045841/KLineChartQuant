import type { RendererPluginWithHost } from '../../../../foundation/plugin/index.js'

import { createIndicatorScaleRendererPlugin } from './indicator_scale.js'

export function createRsiScaleRendererPlugin(options: {
  axisWidth: number
  paneId: string
  instanceId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
  return createIndicatorScaleRendererPlugin({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    instanceId: options.instanceId,
    indicatorKey: 'rsi',
    label: 'RSI',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
