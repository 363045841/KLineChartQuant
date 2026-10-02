/** 构建副图指标标题数据，文本统一交给独立 DOM Legend renderer。 */
import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import { RENDERER_PRIORITY, type RenderContext } from '../../foundation/plugin/index.js'
import { resolveThemeColors } from '../../foundation/tokens/index.js'
import type { KLineData } from '../../foundation/types/price.js'
import type { Layer } from '../../rendering/scene/types.js'
import { PANE_HEADER_INSET_PX } from '../chartTypes.js'
import { getRegisteredIndicatorDefinition } from '../indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '../indicators/indicatorMetadata.js'
import type { SubIndicatorType } from './Indicator/index.js'

export type { TitleInfo, TitleValueItem } from '../indicators/indicatorMetadata.js'

export interface PaneTitleOptions {
  paneId: string
  title: string
  description?: string
  yOffset?: number
  indicatorId: SubIndicatorType
  instanceId: string
  params: Record<string, unknown>
}

/** 从实例投影读取当前标题，发布 Pane 内唯一的 DOM Legend 行。 */
export function createPaneTitleRendererLayer(options: PaneTitleOptions): Layer<RenderContext> {
  return {
    id: makePluginLayerId(`paneTitle_${options.paneId}`),
    role: 'overlay',
    pane: options.paneId,
    z: RENDERER_PRIORITY.FOREGROUND,
    visible: true,
    paint(context) {
      if (context.pane.id !== options.paneId) return
      const colors = resolveThemeColors(
        context.theme,
        context.isAsiaMarket,
        context.colorPresetSettings,
      )
      const data = context.data as KLineData[]
      const index = context.crosshairIndex ?? Math.min(context.range.end - 1, data.length - 1)
      const meta = getRegisteredIndicatorDefinition(options.indicatorId)
      let title: TitleInfo | null = null
      if (meta?.getTitleInfo && context.indicatorStateReader) {
        title = meta.getTitleInfo(
          data,
          index,
          options.params as Record<string, number | boolean | string>,
          context.indicatorStateReader,
          options.instanceId,
          options.paneId,
          colors,
        )
      }
      const bar = data[index]
      if (!meta && bar?.volume !== undefined) {
        title = {
          name: options.title,
          values: [
            {
              label: 'VOL',
              value: bar.volume,
              color: bar.open < bar.close ? colors.volumeUp : colors.volumeDown,
            },
          ],
        }
      }
      context.publishLegendRows?.(options.paneId, [
        {
          key: options.instanceId,
          paneId: options.paneId,
          x: PANE_HEADER_INSET_PX,
          y: context.pane.top + (options.yOffset ?? 12),
          maxWidth: Math.max(0, context.paneWidth - PANE_HEADER_INSET_PX),
          height: 18,
          gap: 8,
          indicator: { instanceId: options.instanceId, definitionId: options.indicatorId },
          texts: [
            { text: title?.name ?? meta?.displayName ?? options.title, color: colors.text.primary },
            ...(title?.params?.length
              ? [{ text: `(${title.params.join(',')})`, color: colors.text.tertiary }]
              : []),
            ...(title?.values?.map((item) => ({
              text: `${item.label} ${item.value.toFixed(3)}`,
              color: item.color,
            })) ?? []),
            ...(!title && options.description
              ? [{ text: ` - ${options.description}`, color: colors.text.weak }]
              : []),
          ],
        },
      ])
    },
    dispose() {},
  }
}
