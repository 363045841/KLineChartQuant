import type { RendererPlugin, RenderContext } from '../../plugin'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../plugin'
import type { KLineData } from '../../types/price'
import { createHorizontalLineRect, createVerticalLineRect } from '../draw/pixelAlign'
import { findMonthBoundaries } from '../../utils/dateFormat'
import { resolveThemeColors } from '../../tokens'


/**
 * 创建网格线渲染器插件
 * 横向按像素均分铺满整个绘图区高度，纵向按月分割（使用预计算的月边界，网格线对齐到K线实体中部）
 * 渲染到所有 pane（使用 GLOBAL_PANE_ID）
 */
export function createGridLinesRendererPlugin(): RendererPlugin {
    return {
        name: 'gridLines',
        version: '1.0.0',
        description: '网格线渲染器',
        debugName: '网格线',
        paneId: GLOBAL_PANE_ID,
        priority: RENDERER_PRIORITY.GRID,

        draw(context: RenderContext) {
            const { ctx, pane, data, range, scrollLeft, kWidth, dpr, kLinePositions, settings } = context
            const colors = resolveThemeColors(context.theme, context.isAsiaMarket, context.colorPresetSettings)
            const klineData = data as KLineData[]
            if (!klineData.length) return
            if (settings?.showGridLines === false) return

            ctx.save()
            ctx.fillStyle = colors.gridMajor
            ctx.translate(-scrollLeft, 0)

            const plotWidth = ctx.canvas.width / dpr
            const startX = scrollLeft
            const endX = scrollLeft + plotWidth
            // 水平网格线：从预计算的 yAxisTicks 取 Y 位置，确保与轴刻度对齐
            if (context.yAxisTicks) {
                for (const tick of context.yAxisTicks) {
                    const h = createHorizontalLineRect(startX, endX, tick.y, dpr)
                    if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
                }
            }

            const boundaries = findMonthBoundaries(klineData, context.monthKeys)

            for (const idx of boundaries) {
                if (idx < range.start || idx >= range.end || idx >= klineData.length) continue

                // 使用统一的 kLinePositions 计算 K 线中心 X 坐标
                const localIdx = idx - range.start
                if (localIdx < 0 || localIdx >= kLinePositions.length) continue
                const worldX = kLinePositions[localIdx]! + kWidth / 2

                const v = createVerticalLineRect(worldX, 0, pane.height, dpr)
                if (v) ctx.fillRect(v.x, v.y, v.width, v.height)
            }

            ctx.restore()
        },
    }
}
