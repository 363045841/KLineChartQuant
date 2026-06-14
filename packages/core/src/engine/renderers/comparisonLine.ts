import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import type { KLineData } from '../../types/price'

const DEFAULT_COMPARISON_COLOR = '#f59e0b'

export function createComparisonLineRenderer(): RendererPlugin {
    return {
        name: 'comparisonLine',
        version: '1.0.0',
        description: '比较商品百分比折线渲染器',
        debugName: '比较折线',
        paneId: 'main',
        priority: RENDERER_PRIORITY.MAIN + 2,

        draw(context: RenderContext) {
            const mainData = context.data as KLineData[]
            const comparisonData = context.comparisonData
            const comparisonSymbols = context.comparisonSymbols ?? []
            if (!mainData.length || !comparisonData?.size || comparisonSymbols.length === 0) return
            if (context.pane.id !== 'main') return

            const baseIndex = Math.max(0, context.range.start)
            const baseItem = mainData[baseIndex]
            if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return
            const mainBase = baseItem.close
            const baseDate = baseItem.date ?? ''

            const ctx = context.ctx
            ctx.save()
            ctx.translate(-context.scrollLeft, 0)
            ctx.lineWidth = Math.max(1, 1.5 / context.dpr)

            for (let symbolIndex = 0; symbolIndex < comparisonSymbols.length; symbolIndex++) {
                const spec = comparisonSymbols[symbolIndex]!
                const data = comparisonData.get(spec.symbol)
                if (!data?.length) continue

                const baseline = baseDate ? findBaselineByDate(data, baseDate) : findBaselineByTimestamp(data, baseItem.timestamp)
                if (!baseline || baseline.close <= 0) continue

                const byDate = new Map<string, KLineData>()
                for (const item of data) {
                  if (item.date) byDate.set(item.date, item)
                  else byDate.set(String(item.timestamp), item)
                }

                const colors = context.comparisonColors

                ctx.beginPath()
                ctx.strokeStyle = colors?.get(spec.symbol) ?? DEFAULT_COMPARISON_COLOR
                let hasPath = false
                let previousHadPoint = false

                for (let i = context.range.start; i < context.range.end && i < mainData.length; i++) {
                    const mainItem = mainData[i]
                    if (!mainItem) {
                        previousHadPoint = false
                        continue
                    }
                    const key = mainItem.date ?? String(mainItem.timestamp)
                    const item = byDate.get(key)
                    const x = context.kLineCenters[i - context.range.start]
                    if (!item || x === undefined || !Number.isFinite(item.close)) {
                        previousHadPoint = false
                        continue
                    }

                    const pct = ((item.close - baseline.close) / baseline.close) * 100
                    const equivalentPrice = mainBase * (1 + pct / 100)
                    const y = context.pane.yAxis.priceToY(equivalentPrice)
                    if (!Number.isFinite(y)) {
                        previousHadPoint = false
                        continue
                    }

                    if (previousHadPoint) ctx.lineTo(x, y)
                    else ctx.moveTo(x, y)
                    previousHadPoint = true
                    hasPath = true
                }

                if (hasPath) ctx.stroke()
            }

            ctx.restore()
        },
    }
}

function findBaselineByDate(data: ReadonlyArray<KLineData>, date: string): KLineData | null {
    for (const item of data) {
        if (item.date && item.date >= date) return item
    }
    return null
}

function findBaselineByTimestamp(data: ReadonlyArray<KLineData>, timestamp: number): KLineData | null {
    for (const item of data) {
        if (item.timestamp >= timestamp) return item
    }
    return null
}
