import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY } from '../../plugin'
import type { KLineData } from '../../types/price'

const COMPARISON_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316']

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
            const mainBase = mainData[baseIndex]?.close
            const baseTimestamp = mainData[baseIndex]?.timestamp
            if (!Number.isFinite(mainBase) || mainBase <= 0 || baseTimestamp === undefined) return

            const ctx = context.ctx
            ctx.save()
            ctx.translate(-context.scrollLeft, 0)
            ctx.lineWidth = Math.max(1, 1.5 / context.dpr)

            for (let symbolIndex = 0; symbolIndex < comparisonSymbols.length; symbolIndex++) {
                const spec = comparisonSymbols[symbolIndex]
                const data = comparisonData.get(spec.symbol)
                if (!data?.length) continue

                const baseline = findBaseline(data, baseTimestamp)
                if (!baseline || baseline.close <= 0) continue

                const byTimestamp = new Map<number, KLineData>()
                for (const item of data) byTimestamp.set(item.timestamp, item)

                ctx.beginPath()
                ctx.strokeStyle = COMPARISON_COLORS[symbolIndex % COMPARISON_COLORS.length]!
                let hasPath = false
                let previousHadPoint = false

                for (let i = context.range.start; i < context.range.end && i < mainData.length; i++) {
                    const mainItem = mainData[i]
                    if (!mainItem) {
                        previousHadPoint = false
                        continue
                    }
                    const item = byTimestamp.get(mainItem.timestamp)
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

function findBaseline(data: ReadonlyArray<KLineData>, timestamp: number): KLineData | null {
    for (const item of data) {
        if (item.timestamp >= timestamp) return item
    }
    return null
}
