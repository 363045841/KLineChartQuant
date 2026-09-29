/**
 * Schaff Trend Cycle 副图坐标轴渲染器工厂。
 */

import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'

import { createIndicatorScaleLayer } from './indicator_scale.js'

/**
 * 创建 Schaff Trend Cycle 坐标轴渲染器。
 * @param options 坐标轴渲染配置。
 * @returns STC 坐标轴渲染器插件。
 */
export function createSchaffTrendCycleScaleLayer(options: {
  axisWidth: number
  paneId: string
  /** 该坐标轴绑定的指标实例身份。 */
  instanceId: string
  yPaddingPx?: number
  getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): Layer<RenderContext> {
  return createIndicatorScaleLayer({
    axisWidth: options.axisWidth,
    paneId: options.paneId,
    instanceId: options.instanceId,
    indicatorKey: 'schaffTrendCycle',
    label: 'STC',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
