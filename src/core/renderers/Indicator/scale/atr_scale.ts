import type { RendererPluginWithHost } from '@/plugin'
import { createIndicatorScaleRendererPlugin } from './indicator_scale'

export function createAtrScaleRendererPlugin(options: {
    axisWidth: number
    paneId: string
    yPaddingPx?: number
    getCrosshair?: () => { y: number; price: number; activePaneId: string | null } | null
}): RendererPluginWithHost {
    return createIndicatorScaleRendererPlugin({
        axisWidth: options.axisWidth,
        paneId: options.paneId,
        indicatorKey: 'atr',
        label: 'ATR',
        decimals: 2,
        yPaddingPx: options.yPaddingPx,
        getCrosshair: options.getCrosshair,
    })
}
