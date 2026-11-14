/** Y 轴统一帧入口：按轴生成刻度和十字线标签；绘制由帧提交阶段一次完成。 */
import type { AxisFrameApi } from '@/engine/pane/axisTypes.js'
import { bindRenderAxis } from '@/foundation/geometry/axisBinding.js'
import { AXIS_LABEL_KIND, type RenderContext } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ScaleType } from '@/foundation/types/scaleType.js'
import { createYAxisTicks } from '../scale/impl/axisTicks/axisTicks.js'
import { formatScaleValue, resolveAdaptiveDecimals } from './Indicator/scale/scaleFormat.js'
import { registerAxisLabel } from './impl/labels/index.js'

/** 每条轴只生成一份刻度，所有标签均带明确轴身份。 */
export const axisFrameApi: AxisFrameApi = {
  collect(context, axes, crosshair) {
    const colors = resolveThemeColors(
      context.theme,
      context.isAsiaMarket,
      context.colorPresetSettings,
    )
    for (const spec of axes) {
      if (!spec.visible) continue
      const bound = bindRenderAxis(context, spec.axisId)
      const axis = bound.pane.yAxis
      const percent = axis.getScaleType() === ScaleType.Percent
      const decimals = resolveAdaptiveDecimals(axis.getDisplayRange(), spec.decimals)
      const format =
        spec.format ??
        ((value: number): string =>
          percent
            ? `${axis.toPercent(value) >= 0 ? '+' : ''}${axis.toPercent(value).toFixed(decimals)}%`
            : formatScaleValue(value, decimals))
      const ticks = createYAxisTicks(bound.pane, { rightTypeSetting: axis.getScaleType() }, percent)
      for (const tick of ticks)
        registerAxisLabel(
          bound,
          'yRightStatic',
          {
            kind: AXIS_LABEL_KIND.TICK,
            text: format(tick.value),
            pos: tick.y,
            color: colors.text.secondary,
            fontSize: 12,
          },
          spec.axisId,
        )
      if (crosshair?.activePaneId === context.pane.id) {
        const localY = Math.max(
          axis.getContentTop(),
          Math.min(axis.getContentBottom(), crosshair.y - context.pane.top),
        )
        registerAxisLabel(
          bound,
          'yRightOverlay',
          {
            kind: AXIS_LABEL_KIND.TAG,
            text: format(axis.yToPrice(localY)),
            pos: localY + context.pane.top,
            origin: context.pane.top,
            variant: 'crosshair',
            bgColor: colors.crosshairLabelBg,
            textColor: colors.crosshairLabelText,
            fontSize: 12,
          },
          spec.axisId,
        )
      }
      if (context.leftAxisCtx && percent)
        for (const tick of ticks)
          registerAxisLabel(
            bound,
            'yLeftStatic',
            {
              kind: AXIS_LABEL_KIND.TICK,
              text: formatScaleValue(tick.value, decimals),
              pos: tick.y,
              color: colors.text.secondary,
              fontSize: 12,
            },
            spec.axisId,
          )
    }
  },
}
