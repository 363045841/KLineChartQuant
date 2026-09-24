/**
 * Fisher Transform 副图坐标轴渲染器工厂。
 */

import type { RendererPluginWithHost } from '@/foundation/plugin/index.js'

import { createIndicatorScaleRendererPlugin } from './indicator_scale.js'

/**
 * 创建 Fisher Transform 坐标轴渲染器。
 * @param options 坐标轴渲染配置。
 * @returns Fisher Transform 坐标轴渲染器插件。
 */
export function createFisherTransformScaleRendererPlugin(options: {
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
    indicatorKey: 'fisherTransform',
    label: 'Fisher',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
