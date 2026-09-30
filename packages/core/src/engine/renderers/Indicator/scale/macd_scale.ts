import type { RenderContext } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'

import { createIndicatorScaleLayer } from './indicator_scale.js'

/**
 * 创建 MACD 刻度渲染器插件
 */
export function createMacdScaleLayer(options: {
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
    indicatorKey: 'macd',
    label: 'MACD',
    decimals: 2,
    yPaddingPx: options.yPaddingPx,
    getCrosshair: options.getCrosshair,
  })
}
