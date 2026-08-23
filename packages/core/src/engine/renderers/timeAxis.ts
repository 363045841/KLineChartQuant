import type { RendererPlugin, RenderContext } from '../../foundation/plugin/index'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index'
import { resolveThemeColors } from '../../foundation/tokens/index'
import type { KLineData } from '../../foundation/types/price'
import { getFont, setCanvasFont } from '../../foundation/tokens/fonts'
import { alignToPhysicalPixelCenter, roundToPhysicalPixel } from '../../foundation/utils/pixelAlign'
import {
  drawTimeAxis,
  drawCrosshairTimeLabel,
  drawAxisTimeLabel,
} from '../../foundation/utils/kLineDraw/axis'

/** 时间轴面板 ID（特殊标识，用于单独渲染） */
const TIME_AXIS_PANE_ID = Symbol('time-axis')

/** 将领域交易日格式化为五日轴标签。 */
function formatTradingDateLabel(tradingDate: string): string {
  return tradingDate.slice(5)
}

/** 使用共享日几何绘制五日分时日期标签。 */
function drawFiveDayTimeShareAxis(context: RenderContext, height: number, textColor: string): void {
  const geometry = context.fiveDayTimeShareGeometry
  if (!geometry) return
  const { ctx, scrollLeft, paneWidth, dpr } = context
  ctx.save()
  setCanvasFont(ctx, getFont(12))
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textY = alignToPhysicalPixelCenter(height / 2, dpr)
  for (const day of geometry.days) {
    const screenX = day.labelX - scrollLeft
    if (screenX < 0 || screenX > paneWidth) continue
    ctx.fillText(formatTradingDateLabel(day.tradingDate), roundToPhysicalPixel(screenX, dpr), textY)
  }
  ctx.restore()
}

/**
 * 创建时间轴渲染器插件
 * 注意：时间轴渲染到 xAxisCanvas，需要特殊处理
 */
export function createTimeAxisRendererPlugin(options: {
  height: number
  getCrosshair?: () => { x: number; index: number } | null
}): RendererPlugin {
  return {
    name: 'timeAxis',
    version: '1.0.0',
    description: '时间轴渲染器',
    debugName: '时间轴',
    paneId: TIME_AXIS_PANE_ID,
    priority: RENDERER_PRIORITY.SYSTEM_XAXIS,
    isSystem: true, // 系统渲染器：由 Scene Layer 调度

    draw(context: RenderContext) {
      const { ctx, data, range, scrollLeft, kWidth, kGap, dpr, paneWidth } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const klineData = data as KLineData[]

      // 时间轴绘制到传入的 ctx
      const targetCtx = ctx

      // 使用 paneWidth 作为时间轴宽度，确保与视口一致
      const w = paneWidth
      const h = options.height

      targetCtx.setTransform(1, 0, 0, 1, 0, 0)
      targetCtx.scale(dpr, dpr)
      targetCtx.clearRect(0, 0, w, h)

      if (context.fiveDayTimeShareGeometry) {
        drawFiveDayTimeShareAxis(context, h, colors.text.secondary)
      } else {
        drawTimeAxis(
          targetCtx,
          {
            x: 0,
            y: 0,
            width: w,
            height: h,
            data: klineData,
            scrollLeft,
            kWidth,
            kGap,
            startIndex: range.start,
            endIndex: range.end,
            dpr,
            kLineCenters: context.kLineCenters,
            visibleRange: range,
            textColor: colors.text.secondary,
            lineColor: colors.border.dark,
            drawTopBorder: false,
            drawBottomBorder: false,
            period: context.period,
            marketSession: context.marketSession,
            monthKeys: context.monthKeys,
            dayKeys: context.dayKeys,
          },
          context.theme,
          context.isAsiaMarket,
          context.colorPresetSettings,
        )
      }

      // 绘制来自 xAxisRanges 的时间范围带（先于标签绘制）
      if (context.xAxisRanges) {
        for (const range of context.xAxisRanges) {
          const screenLeftX = range.leftX - scrollLeft
          const screenRightX = range.rightX - scrollLeft
          const bandWidth = screenRightX - screenLeftX
          if (bandWidth <= 0) continue
          targetCtx.save()
          targetCtx.globalAlpha = range.opacity
          targetCtx.fillStyle = range.color
          targetCtx.fillRect(screenLeftX, 0, bandWidth, h)
          targetCtx.restore()
        }
      }

      // 绘制十字线时间标签
      const crosshair = options.getCrosshair?.()
      if (crosshair && typeof crosshair.index === 'number') {
        const k = klineData[crosshair.index]
        if (k) {
          drawCrosshairTimeLabel(
            targetCtx,
            {
              x: 0,
              y: 0,
              width: w,
              height: h,
              crosshairX: crosshair.x,
              timestamp: k.timestamp,
              dpr,
              fontSize: 12,
              bgColor: colors.crosshairLabelBg,
              textColor: colors.crosshairLabelText,
              period: context.period,
            },
            context.theme,
            context.isAsiaMarket,
            context.colorPresetSettings,
          )
        }
      }

      // 绘制来自 xAxisLabels 的标签（极值点、绘图锚点等）
      if (context.xAxisLabels) {
        for (const label of context.xAxisLabels) {
          // 将世界坐标X转换为屏幕坐标
          const screenX = label.x - scrollLeft

          // 检查是否在可视范围内
          if (screenX >= 0 && screenX <= w) {
            drawAxisTimeLabel(
              targetCtx,
              {
                x: 0,
                y: 0,
                width: w,
                height: h,
                labelX: screenX,
                timestamp: label.timestamp,
                dpr,
                fontSize: 12,
                bgColor: label.style?.bgColor,
                textColor: label.style?.textColor,
              },
              context.theme,
              context.isAsiaMarket,
              context.colorPresetSettings,
            )
          }
        }
      }
    },
  }
}
