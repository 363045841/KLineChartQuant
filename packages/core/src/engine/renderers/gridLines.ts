import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY, GLOBAL_PANE_ID } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import type { KLineData } from '../../foundation/types/price'
import { findMonthBoundaries } from '../../foundation/utils/dateFormat'
import { createHorizontalLineRect, createVerticalLineRect } from '../../foundation/utils/pixelAlign'

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
      const { ctx, pane, data, range, scrollLeft, dpr, kLineCenters, settings } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const klineData = data as KLineData[]
      if (!klineData.length) return
      if (settings?.showGridLines === false) return

      ctx.save()
      ctx.fillStyle = colors.gridMajor
      ctx.translate(-scrollLeft, 0)

      const plotWidth = ctx.canvas.width / dpr
      const startX = scrollLeft
      const endX = scrollLeft + plotWidth

      // Pane 分隔线：非首 pane 在顶部画一条横线
      if (pane.top > 0) {
        const h = createHorizontalLineRect(startX, endX, 0, dpr)
        if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
      }

      // 水平网格线：从预计算的 yAxisTicks 取 Y 位置，确保与轴刻度对齐
      if (context.yAxisTicks) {
        for (const tick of context.yAxisTicks) {
          const h = createHorizontalLineRect(startX, endX, tick.y, dpr)
          if (h) ctx.fillRect(h.x, h.y, h.width, h.height)
        }
      }

      // 五日分时纵线直接读取帧级日分隔几何，保证与主序列和十字线同源。
      if (context.fiveDayTimeShareGeometry) {
        for (const day of context.fiveDayTimeShareGeometry.days) {
          if (day.separatorX === undefined) continue
          const v = createVerticalLineRect(day.separatorX, 0, pane.height, dpr)
          if (v) ctx.fillRect(v.x, v.y, v.width, v.height)
        }
      } else if (context.period !== 'timeshare') {
        const boundaries = findMonthBoundaries(klineData, context.monthKeys)

        for (const idx of boundaries) {
          if (idx < range.start || idx >= range.end || idx >= klineData.length) continue

          // 使用帧级中心点，避免 kWidth 物理像素取整后与 K 线实体、十字线偏移。
          const localIdx = idx - range.start
          if (localIdx < 0 || localIdx >= kLineCenters.length) continue
          const worldX = kLineCenters[localIdx]!

          const v = createVerticalLineRect(worldX, 0, pane.height, dpr)
          if (v) ctx.fillRect(v.x, v.y, v.width, v.height)
        }
      }

      ctx.restore()
    },
  }
}
