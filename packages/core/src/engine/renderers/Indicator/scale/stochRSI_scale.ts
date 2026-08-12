/**
 * StochRSI 副图坐标轴渲染器工厂。
 */

import type { RendererPluginWithHost } from '../../../../foundation/plugin/index'

import { createIndicatorScaleRendererPlugin } from './indicator_scale'

/**
 * 创建 StochRSI 坐标轴渲染器。
 * @param options 坐标轴渲染配置。
 * @returns StochRSI 坐标轴渲染器插件。
 */
export function createStochRSIScaleRendererPlugin(options: {
  axisWidth: number
  paneId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
  return createIndicatorScaleRendererPlugin({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    indicatorKey: 'stochRSI',
    label: 'StochRSI',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
