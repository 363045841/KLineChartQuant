/**
 * Ultimate Oscillator 坐标轴渲染器薄包装。
 */

import type { RendererPluginWithHost } from '../../../../foundation/plugin/index.js'

import { createIndicatorScaleRendererPlugin } from './indicator_scale.js'

/**
 * 创建 Ultimate Oscillator 坐标轴渲染器。
 * @param options 坐标轴和 pane 配置。
 * @returns UO 坐标轴插件。
 */
export function createUltimateOscillatorScaleRendererPlugin(options: {
  axisWidth: number
  paneId: string
  /** 该坐标轴绑定的指标实例身份。 */
  instanceId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
  return createIndicatorScaleRendererPlugin({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    instanceId: options.instanceId,
    indicatorKey: 'ultimateOscillator',
    label: 'UO',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
