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
import { resolveLegendValueIndex } from './legend/impl/resolveLegendValueIndex.js'

export type { TitleInfo, TitleValueItem } from '../indicators/indicatorMetadata.js'

/** 副图标题距 Pane 顶部的偏移。 */
const PANE_TITLE_TOP_PX = 12
/** 副图标题行高。 */
const PANE_TITLE_HEIGHT_PX = 18

export interface PaneTitleOptions {
  paneId: string
  /** 无注册指标定义时的展示名（如成交量）。 */
  title: string
  indicatorId: SubIndicatorType
  instanceId: string
  /** 指标被隐藏时标题行保留并置灰。 */
  hidden?: boolean
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
      const index = resolveLegendValueIndex(context.crosshairIndex, data.length)
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
      // 成交量没有注册指标定义，标题值由当前 K 线成交量合成。
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
          y: context.pane.top + PANE_TITLE_TOP_PX,
          maxWidth: Math.max(0, context.paneWidth - PANE_HEADER_INSET_PX),
          height: PANE_TITLE_HEIGHT_PX,
          gap: 8,
          indicator: { instanceId: options.instanceId, definitionId: options.indicatorId },
          hidden: options.hidden === true,
          texts: [
            { text: title?.name ?? options.title, color: colors.text.primary },
            ...(title?.params?.length
              ? [{ text: `(${title.params.join(',')})`, color: colors.text.tertiary }]
              : []),
            ...(title?.values?.map((item) => ({
              text: `${item.label} ${item.value.toFixed(3)}`,
              color: item.color,
            })) ?? []),
          ],
        },
      ])
    },
    dispose() {},
  }
}
