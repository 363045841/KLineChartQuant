import type { RendererPluginWithHost, RenderContext, PluginHost } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import { resolveThemeColors } from '../../tokens'
import { getFont, setCanvasFont } from '../theme/fonts'
import { SUB_PANE_INDICATOR_CONFIGS } from './Indicator/subPaneConfig'
import type { SubIndicatorType } from './Indicator'

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

export interface TitleValueItem {
    label: string
    value: number
    color: string
}

export interface TitleInfo {
    name: string
    params?: number[]
    values?: TitleValueItem[]
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
            const y = currentOptions.yOffset ?? fontSize
            const gap = 8

            overlayCtx.save()
            setCanvasFont(overlayCtx, getFont(fontSize))
            overlayCtx.textAlign = 'left'
            overlayCtx.textBaseline = 'top'

            const config = SUB_PANE_INDICATOR_CONFIGS[currentOptions.indicatorId]
            const crosshairIndex = context.crosshairIndex ?? null
            const titleInfo = config && pluginHost
                ? config.getTitleInfo(context.data, crosshairIndex, currentOptions.params as Record<string, number | boolean | string>, pluginHost, currentOptions.paneId)
                : null

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
