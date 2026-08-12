/**
 * Awesome Oscillator 坐标轴渲染器薄包装。
 */

import type { RendererPluginWithHost } from '../../../../foundation/plugin/index'

import { createIndicatorScaleRendererPlugin } from './indicator_scale'

/**
 * 创建 Awesome Oscillator 坐标轴渲染器。
 * @param options 坐标轴和 pane 配置。
 * @returns AO 坐标轴插件。
 */
export function createAwesomeOscillatorScaleRendererPlugin(options: {
  axisWidth: number
  paneId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
  return createIndicatorScaleRendererPlugin({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    indicatorKey: 'awesomeOscillator',
    label: 'AO',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
