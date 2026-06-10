import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import { resolveThemeColors } from '../../tokens'
import { getFont, setCanvasFont } from '../theme/fonts'
import type { SubIndicatorType } from './Indicator'
import type { KLineData } from '../../types/price'
import type { TitleInfo } from '../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../indicators/scheduler'

/**
 * @deprecated 请从 indicatorMetadata 导入 TitleInfo
 */
export type { TitleInfo, TitleValueItem } from '../indicators/indicatorMetadata'

function getVolumeTitleInfo(
    data: KLineData[],
    index: number | null,
    _params: Record<string, number | boolean | string>,
    _host: PluginHost,
    _paneId: string,
): TitleInfo | null {
    if (index === null) return null
    const kline = data[index]
    if (!kline || kline.volume === undefined) return null
    const color = kline.open < kline.close ? '#ef4444' : '#22c55e'
    return {
        name: 'VOL',
        params: [],
        values: [{ label: 'VOL', value: kline.volume, color }],
    }
}

const textWidthCache = new Map<string, number>()
const TEXT_WIDTH_CACHE_LIMIT = 256

function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
    const key = `${ctx.font}\n${text}`
    const cached = textWidthCache.get(key)
    if (cached !== undefined) {
        return cached
    }

    const width = ctx.measureText(text).width
    if (textWidthCache.size >= TEXT_WIDTH_CACHE_LIMIT) {
        textWidthCache.clear()
    }
    textWidthCache.set(key, width)
    return width
}

export interface PaneTitleOptions {
    paneId: string
    title: string
    description?: string
    yOffset?: number
    indicatorId: SubIndicatorType
    params: Record<string, unknown>
}

export function createPaneTitleRendererPlugin(options: PaneTitleOptions): RendererPluginWithHost {
    let currentOptions = { ...options }
    let pluginHost: PluginHost | null = null

    return {
        name: `paneTitle_${options.paneId}`,
        version: '1.0.0',
        description: '面板标题渲染器',
        debugName: '面板标题',
        paneId: options.paneId,
        priority: RENDERER_PRIORITY.FOREGROUND,
        layer: 'overlay',

        onInstall(host: PluginHost) {
            pluginHost = host
        },

        draw(context: RenderContext) {
            const { overlayCtx, pane, paneWidth } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            if (pane.id !== currentOptions.paneId || !overlayCtx) return

            const fontSize = 12
            const x = 12
            let y = currentOptions.yOffset ?? fontSize
            const gap = 8

            overlayCtx.save()
            setCanvasFont(overlayCtx, getFont(fontSize))
            overlayCtx.textAlign = 'left'
            overlayCtx.textBaseline = 'top'

            const crosshairIndex = context.crosshairIndex ?? null
            const castParams = currentOptions.params as Record<string, number | boolean | string>
            const klineData = context.data as KLineData[]

            // 优先从 indicator metadata registry 获取 getTitleInfo
            let titleInfo: TitleInfo | null = null
            const scheduler = pluginHost?.getService<IndicatorScheduler>('indicatorScheduler')
            const meta = scheduler?.getIndicatorMetadata(currentOptions.indicatorId)
            if (meta?.getTitleInfo && pluginHost) {
                titleInfo = meta.getTitleInfo(klineData, crosshairIndex, castParams, pluginHost, currentOptions.paneId)
            }

            // fallback: VOLUME 不是注册指标，内联处理
            if (!titleInfo && pluginHost) {
                titleInfo = getVolumeTitleInfo(klineData, crosshairIndex, castParams, pluginHost, currentOptions.paneId)
            }

            if (titleInfo) {
                let currentX = x

                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText(titleInfo.name, currentX, y)
                currentX += measureTextWidth(overlayCtx, titleInfo.name)

                if (titleInfo.params && titleInfo.params.length > 0) {
                    const paramText = `(${titleInfo.params.join(',')})`
                    overlayCtx.fillStyle = colors.text.tertiary
                    overlayCtx.fillText(paramText, currentX, y)
                    currentX += measureTextWidth(overlayCtx, paramText) + gap
                } else {
                    currentX += gap
                }

                if (titleInfo.values && titleInfo.values.length > 0) {
                    y += 1
                    for (const item of titleInfo.values) {
                        const valueText = `${item.label} ${item.value.toFixed(3)}`
                        overlayCtx.fillStyle = item.color
                        overlayCtx.fillText(valueText, currentX, y)
                        currentX += measureTextWidth(overlayCtx, valueText) + gap
                    }
                }
            } else {
                overlayCtx.fillStyle = colors.text.primary
                overlayCtx.fillText(currentOptions.title, x, y)

                if (currentOptions.description) {
                    const titleWidth = measureTextWidth(overlayCtx, currentOptions.title)
                    overlayCtx.fillStyle = colors.text.weak
                    overlayCtx.fillText(` - ${currentOptions.description}`, x + titleWidth, y)
                }
            }

            overlayCtx.restore()
        },

        setConfig(config: Record<string, unknown>) {
            currentOptions = { ...currentOptions, ...config }
        },
    }
}
