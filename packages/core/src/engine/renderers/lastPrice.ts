import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import type { KLineData } from '../../types/price'
import { resolveThemeColors } from '../../tokens'

function getLastPriceInfo(context: RenderContext) {
    const { pane, data } = context
    const klineData = data as KLineData[]
    const last = klineData[klineData.length - 1]
    if (!last) return null

    const displayRange = pane.yAxis.getDisplayRange(pane.priceRange)
    if (last.close < displayRange.minPrice || last.close > displayRange.maxPrice) {
        return null
    }

    return {
        price: last.close,
        y: Math.round(pane.yAxis.priceToY(last.close)),
        dataIndex: klineData.length - 1,
    }
}

/**
 * 最新价 label 注册渲染器（overlay 层，确保悬停时 label 也注册到 yAxisLabels）
 */
export function createLastPriceLabelRegistrarPlugin(): RendererPlugin {
    return {
        name: 'lastPriceLabelRegistrar',
        version: '1.0.0',
        description: '最新价 label 注册',
        debugName: '最新价标签注册',
        paneId: 'main',
        layer: 'overlay',
        priority: RENDERER_PRIORITY.LAST_PRICE_LABEL,

        draw(context: RenderContext) {
            if (context.period === 'timeshare') return
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const info = getLastPriceInfo(context)
            if (!info) return

            if (!context.yAxisLabels) context.yAxisLabels = []
            context.yAxisLabels.push({
                dataIndex: info.dataIndex,
                price: info.price,
                y: info.y,
                type: 'lastPrice',
                style: {
                    bgColor: colors.lastPriceLabel.bg,
                    borderColor: colors.price.lastPrice,
                    textColor: colors.price.lastPrice,
                }
            })
        },
    }
}

/**
 * 创建最新价虚线渲染器插件（绘制虚线）
 */
export function createLastPriceLineRendererPlugin(): RendererPlugin {
    return {
        name: 'lastPriceLine',
        version: '1.0.0',
        description: '最新价虚线渲染器',
        debugName: '最新价线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.LAST_PRICE_LABEL,

        draw(context: RenderContext) {
            if (context.period === 'timeshare') return
            const { ctx, scrollLeft, dpr, paneWidth } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const info = getLastPriceInfo(context)
            if (!info) return

            const y = info.y

            ctx.save()
            ctx.translate(-scrollLeft, 0)

            // 最新价水平线横贯整个视口（从左边缘到右边缘）
            const startX = scrollLeft
            const endX = paneWidth + scrollLeft

            ctx.strokeStyle = colors.price.lastPrice
            ctx.lineWidth = 1
            ctx.setLineDash([4, 3])
            ctx.beginPath()
            const yy = (Math.floor(y * dpr) + 0.5) / dpr
            ctx.moveTo(Math.round(startX * dpr) / dpr, yy)
            ctx.lineTo(Math.round(endX * dpr) / dpr, yy)
            ctx.stroke()
            ctx.setLineDash([])

            ctx.restore()
        },
    }
}
