/**
 * 实例结果到 pane 渲染投影的纯转换。
 *
 * 本模块不知道指标类型结果包和 renderer stateKey。每次回调只处理一个实例，
 * 结果唯一按 paneId / instanceId 写入。
 */
import {
  createIndicatorPaneProjection,
  type IndicatorInstance,
  type IndicatorInstanceSnapshot,
  type IndicatorPaneProjection,
  type IndicatorResultPool,
  type IndicatorSeriesResult,
} from './instanceModel.js'

export interface IndicatorProjectionContext {
  readonly timestamps: readonly number[]
  readonly visibleRange: Readonly<{ start: number; end: number }>
  readonly timestamp: number
}

export type IndicatorInstanceProjector<RenderState> = (
  instance: IndicatorInstance,
  result: IndicatorSeriesResult,
  context: IndicatorProjectionContext,
) => RenderState

/**
 * 从同一实例快照和结果池生成 pane 投影。
 * 缺失结果表示该实例尚未完成计算，不能用其他实例或历史类型结果替代。
 */
export function projectIndicatorInstances<RenderState>(input: {
  readonly instances: IndicatorInstanceSnapshot
  readonly results: IndicatorResultPool
  readonly resultRevision: number
  readonly viewportRevision: number
  readonly context: IndicatorProjectionContext
  readonly project: IndicatorInstanceProjector<RenderState>
}): IndicatorPaneProjection<RenderState> {
  if (input.results.instanceRevision !== input.instances.calculationRevision) {
    throw new TypeError('Indicator result pool does not match instance snapshot')
  }
  const entries: Array<readonly [string, string, RenderState]> = []
  for (const instance of input.instances.instances.values()) {
    const result = input.results.results.get(instance.instanceId)
    if (!result) continue
    entries.push([
      instance.paneId,
      instance.instanceId,
      input.project(instance, result, input.context),
    ])
  }
  return createIndicatorPaneProjection(entries, input.resultRevision, input.viewportRevision)
}
