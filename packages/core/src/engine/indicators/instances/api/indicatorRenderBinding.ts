/**
 * 指标实例渲染绑定契约。
 *
 * renderer 与 scale renderer 在创建时绑定自己的 instanceId；帧内状态读取、
 * 图例枚举主图实例都通过这里定义的 service key，不依赖旧 scheduler。
 */
import type { IndicatorRenderStateReader } from '@/foundation/plugin/index.js'

/** 提供帧外实例状态读取的服务键；值类型为 `IndicatorRenderStateReader`。 */
export const INDICATOR_INSTANCE_STATE_SERVICE = 'indicatorInstanceStateReader'

/** 提供当前启用指标实例清单的服务键。 */
export const INDICATOR_INSTANCE_CATALOG_SERVICE = 'indicatorInstanceCatalog'

/** 图例等消费者需要的最小实例描述。 */
export interface IndicatorInstanceDescriptor {
  readonly instanceId: string
  readonly definitionId: string
  readonly paneId: string
  readonly params: Readonly<Record<string, unknown>>
}

/** 当前启用实例清单服务。 */
export interface IndicatorInstanceCatalog {
  /** 主图实例，按启用顺序。 */
  listMainInstances(): ReadonlyArray<IndicatorInstanceDescriptor>
  /** 指定 pane 的实例，通常只有一个。 */
  listPaneInstances(paneId: string): ReadonlyArray<IndicatorInstanceDescriptor>
}

/** 帧外状态读取服务。 */
export type IndicatorInstanceStateService = IndicatorRenderStateReader
