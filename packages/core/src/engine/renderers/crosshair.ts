/** 十字线 Layer：垂直线绘制到所有 pane，水平线只绘制到活跃 pane。 */
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import {
  createHorizontalLineRect,
  createVerticalLineRect,
} from '../../foundation/utils/pixelAlign.js'
import type { Layer } from '../../rendering/scene/types.js'
import { LAYER_PANE_GLOBAL } from '../../rendering/scene/types.js'

/** 十字线状态读取器：由 ChartRenderer 注入交互控制器。 */
export interface CrosshairLayerOptions {
  getCrosshairState: () => {
    pos: { x: number; y: number } | null
    activePaneId: string | null
    isDragging: boolean
    /** 十字线指向的价格（用于价格轴平移时跟随） */
    price: number | null
  }
}

/**
 * 十字线 Layer（绘制到所有面板；垂直线全 pane，水平线只在活跃面板）。
 * @param options 读取交互控制器的十字线状态
 */
export function createCrosshairLayer(options: CrosshairLayerOptions): Layer<RenderContext> {
  return {
    id: makePluginLayerId('crosshair'),
    role: 'overlay',
    pane: LAYER_PANE_GLOBAL,
    z: RENDERER_PRIORITY.SYSTEM_CROSSHAIR,
    visible: true,
    paint(context) {
      const { pane, dpr, paneWidth, overlayCtx } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const state = options.getCrosshairState()

      if (!state.pos) return

      const { x } = state.pos
      const isActive = pane.id === state.activePaneId

      // 使用价格计算 Y 坐标（支持价格轴平移）
      let localY = -1
      if (isActive && state.price !== null) {
        localY = pane.yAxis.priceToY(state.price)
      }

      // 优先使用 overlayCtx，若不存在则跳过（不回落到主画布）
      const ctx = overlayCtx
      if (!ctx) return

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, paneWidth, pane.height)
      ctx.clip()

      ctx.strokeStyle = colors.crosshairLine
      ctx.lineWidth = 1 / dpr
      ctx.setLineDash([4, 4])

      // 绘制垂直线
      const v = createVerticalLineRect(x, 0, pane.height, dpr)
      if (v) {
        ctx.beginPath()
        ctx.moveTo(v.x + v.width / 2, v.y)
        ctx.lineTo(v.x + v.width / 2, v.y + v.height)
        ctx.stroke()
      }

      // 绘制水平线（仅在活跃面板）
      if (isActive && localY >= 0) {
        const safeY = Math.min(localY, pane.height - 1 / dpr)
        const h = createHorizontalLineRect(0, paneWidth, safeY, dpr)
        if (h) {
          ctx.beginPath()
          ctx.moveTo(h.x, h.y + h.height / 2)
          ctx.lineTo(h.x + h.width, h.y + h.height / 2)
          ctx.stroke()
        }
      }

      ctx.restore()
    },
    dispose() {},
  }
}
