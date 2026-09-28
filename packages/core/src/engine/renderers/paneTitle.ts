import type { RenderContext, RendererPluginWithHost } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { getFont, setCanvasFont } from '../../foundation/tokens/fonts.js'
import type { ColorTokens } from '../../foundation/tokens/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import { PANE_HEADER_INSET_PX } from '../chartTypes.js'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '../indicators/indicatorMetadata.js'

import type { SubIndicatorType } from './Indicator/index.js'

/**
 * @deprecated 请从 indicatorMetadata 导入 TitleInfo
 */
export type { TitleInfo, TitleValueItem } from '../indicators/indicatorMetadata.js'

function getVolumeTitleInfo(
  data: KLineData[],
  index: number | null,
  colors: ColorTokens,
): TitleInfo | null {
  if (index === null) return null
  const kline = data[index]
  if (!kline || kline.volume === undefined) return null
  const color = kline.open < kline.close ? colors.volumeUp : colors.volumeDown
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
  /** 该 pane 绑定的实例身份，标题值从该实例的投影读取。 */
  instanceId: string
  params: Record<string, unknown>
}

export function createPaneTitleRendererPlugin(options: PaneTitleOptions): RendererPluginWithHost {
  let currentOptions = { ...options }

  return {
    name: `paneTitle_${options.paneId}`,
    version: '1.0.0',
    description: '面板标题渲染器',
    debugName: '面板标题',
    paneId: options.paneId,
    priority: RENDERER_PRIORITY.FOREGROUND,
    layer: 'overlay',

    draw(context: RenderContext) {
      const { overlayCtx, pane, paneWidth } = context
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      if (pane.id !== currentOptions.paneId || !overlayCtx) return

      const fontSize = 12
      const x = PANE_HEADER_INSET_PX
      const y = currentOptions.yOffset ?? fontSize
      const gap = 8

      overlayCtx.save()
      setCanvasFont(overlayCtx, getFont(fontSize))
      overlayCtx.textAlign = 'left'
      overlayCtx.textBaseline = 'top'

      const crosshairIndex = context.crosshairIndex ?? null
      const castParams = currentOptions.params as Record<string, number | boolean | string>
      const klineData = context.data as KLineData[]

      // 指标 metadata 来自静态定义注册表；标题值读取该实例自己的投影
      let titleInfo: TitleInfo | null = null
      const meta = getRegisteredIndicatorDefinition(currentOptions.indicatorId)
      if (meta?.getTitleInfo && context.indicatorStateReader) {
        titleInfo = meta.getTitleInfo(
          klineData,
          crosshairIndex,
          castParams,
          context.indicatorStateReader,
          currentOptions.instanceId,
          currentOptions.paneId,
          colors,
        )
      }

      // fallback: VOLUME 不是注册指标，内联处理
      if (!titleInfo) {
        titleInfo = getVolumeTitleInfo(klineData, crosshairIndex, colors)
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
          // y += 1
          for (const item of titleInfo.values) {
            const valueText = `${item.label} ${item.value.toFixed(3)}`
            overlayCtx.fillStyle = item.color
            overlayCtx.fillText(valueText, currentX, y)
            currentX += measureTextWidth(overlayCtx, valueText) + gap
          }
        }
      } else {
        overlayCtx.fillStyle = colors.text.primary
        const fallbackTitle = meta?.displayName ?? currentOptions.title
        overlayCtx.fillText(fallbackTitle, x, y)

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
