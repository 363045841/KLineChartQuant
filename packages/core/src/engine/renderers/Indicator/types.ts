/**
 * 指标渲染绑定契约：只在图表侧使用。
 *
 * 定义注册表只保存计算描述；渲染器与标题投影是图表的绑定数据，不属于注册契约。
 * 因此这里可以依赖渲染上下文，而 Node 侧的定义链不会碰到它。
 */
import type { IndicatorRenderStateReader, RenderContext } from '@/foundation/plugin/types.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import type { KLineData } from '@/foundation/types/price.js'
import type { Layer } from '@/rendering/scene/types.js'
import type { IndicatorId, IndicatorMetadata, TitleInfo } from '../../indicators/indicatorMetadata.js'

/** 渲染器实例化参数：框架在绑定实例时算好并传入。 */
export interface IndicatorRendererOptions {
  paneId: string
  indicatorId: IndicatorId
  /** 渲染器绑定的实例身份；结果与投影都按该 ID 寻址。 */
  instanceId: string
  /** 框架派生的轴身份；渲染器据此把值映射到自己的轴。 */
  axisId: string
  /** 框架分配的稳定 Layer ID；渲染器不得自行推导。 */
  layerId: string
  params?: Record<string, unknown>
}

/** 渲染器工厂：返回可直接绘制的 Layer。 */
export type RendererFactory = (options: IndicatorRendererOptions) => Layer<RenderContext>

/** 标题信息回调：主副图统一由图例管理器调用。 */
export type GetTitleInfoFn = (
  data: readonly KLineData[],
  index: number | null,
  params: Record<string, number | boolean | string>,
  stateReader: IndicatorRenderStateReader,
  instanceId: string,
  paneId: string,
  colors: ColorTokens,
) => TitleInfo | null

/** 图表侧使用定义：计算描述加渲染绑定。 */
export type RenderableIndicator = IndicatorMetadata & {
  /** 渲染器工厂；图表的绑定数据，注册契约里没有它。 */
  readonly rendererFactory: RendererFactory
  /** 标题投影；缺省使用通用标题。 */
  readonly getTitleInfo?: GetTitleInfoFn
}

/**
 * 判断一个注册定义是否带图表渲染绑定。
 *
 * 浏览器组合注册的定义带；Node 只注册计算描述，因此永远为 false。
 */
export function isRenderableIndicator(
  definition: IndicatorMetadata,
): definition is RenderableIndicator {
  return 'rendererFactory' in definition
}
