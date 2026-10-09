/**
 * 指标实例渲染绑定契约。
 *
 * renderer 与 scale renderer 在创建时绑定自己的 instanceId；帧内状态读取、
 * 图例枚举主图实例都通过这里定义的 service key，不依赖旧 scheduler。
 */
import type { IndicatorRenderStateReader } from '@/foundation/plugin/index.js'

/** 提供帧外实例状态读取的服务键；值类型为 `IndicatorRenderStateReader`。 */
export const INDICATOR_INSTANCE_STATE_SERVICE = 'indicatorInstanceStateReader'

/** 提供实例异步可用性上报与读取的服务键；值类型为 `IndicatorAvailabilityRegistry`。 */
export const INDICATOR_AVAILABILITY_SERVICE = 'indicatorAvailability'

/** 内置异步来源 token；聚合层只用它区分来源，不解释其含义。 */
export const INDICATOR_AVAILABILITY_SOURCE = Object.freeze({
  /** 指标计算结果尚未提交。 */
  compute: 'compute',
  /** 指标声明的领域数据输入仍在加载。 */
  trades: 'trades',
})

/**
 * 实例异步可用性上报接口。
 *
 * 任何异步来源（框架计算、领域数据、第三方）都可上报；token 不透明，
 * 聚合为「来源集合非空即加载」，多来源叠加、互不覆盖。
 */
export interface IndicatorAvailabilityReporter {
  /** 上报某来源在实例上的等待状态；pending=false 表示该来源已完成。 */
  report(instanceId: string, source: string, pending: boolean): void
}

/** 供宿主注册的实例可用性注册表：上报 + 读取。 */
export interface IndicatorAvailabilityRegistry extends IndicatorAvailabilityReporter {
  /** 指定实例是否仍在等待任一来源完成。 */
  isLoading(instanceId: string): boolean
}

/** 提供当前启用指标实例清单的服务键。 */
export const INDICATOR_INSTANCE_CATALOG_SERVICE = 'indicatorInstanceCatalog'

/** 图例等消费者需要的最小实例描述。 */
export interface IndicatorInstanceDescriptor {
  readonly instanceId: string
  readonly definitionId: string
  readonly paneId: string
  /** 指标是否被隐藏：隐藏时图例保留但置灰。 */
  readonly hidden: boolean
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
