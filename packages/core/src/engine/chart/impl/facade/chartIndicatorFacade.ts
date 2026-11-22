/**
 * ChartIndicatorFacade —— 指标实例的公开命令面。
 *
 * 实例的创建、更新、移动、删除都从这里写入，身份与所属容器由状态分配；
 * Pane 只是实例的布局容器，不再是调用方的入口。图例、宿主与 Agent 共用
 * 同一组命令，绘图历史失效等宿主副作用也只在这里处理一次。
 */
import type { Computed } from '../../../../foundation/reactivity/signal.js'
import type { IndicatorInstance, SubPaneInfo } from '../../../chart/index.js'
import type { ChartIndicatorManager } from '../../../indicators/chartIndicatorManager.js'
import type {
  IndicatorInstanceCommands,
  IndicatorPlacement,
  InstanceMoveTarget,
} from '../../../pane/types.js'
import type { IndicatorInstancePatch } from '../../../state/indicatorState.js'

/** Indicator Facade 所需依赖。 */
export interface ChartIndicatorFacadeDependencies {
  manager: ChartIndicatorManager
  /** 实例写命令；由 PaneManager 提供，身份由状态分配。 */
  commands: IndicatorInstanceCommands
  /** 实例归属变化会影响图元在 Pane 上的投影。 */
  invalidateDrawingHistory: () => void
}

/** 提供指标实例的读写命令与只读派生视图。 */
export class ChartIndicatorFacade {
  constructor(private readonly deps: ChartIndicatorFacadeDependencies) {}

  /** 返回全部指标实例的派生信号。 */
  get instances(): Computed<ReadonlyArray<IndicatorInstance>> {
    return this.deps.manager.indicatorsComputed
  }

  /** 返回副图指标信息的派生信号。 */
  get subPanes(): Computed<ReadonlyArray<SubPaneInfo>> {
    return this.deps.manager.subPanesComputed
  }

  /**
   * 按定义创建实例。
   *
   * @param definitionId 已注册的指标定义。
   * @param inputs 覆盖默认值的输入。
   * @param placement 缺省时按定义类别决定主图叠加或新建副图。
   * @returns 新实例身份；定义未注册时为 null。
   */
  add(
    definitionId: string,
    inputs?: Readonly<Record<string, unknown>>,
    placement?: IndicatorPlacement,
  ): string | null {
    return this.deps.commands.add(definitionId, inputs, placement)
  }

  /** 读取指标数值序列；与图表实例共用计算身份与结果仓库。 */
  readSeries(
    request: {
      readonly definitionId: string
      readonly inputs?: Readonly<Record<string, unknown>>
    },
    signal: AbortSignal,
  ): Promise<import('../../../indicators/instances/domain/indicatorModel.js').IndicatorResult> {
    return this.deps.manager.readSeries(request, signal)
  }

  /** 更新参数、显隐、排序或定义；身份与归属不变。 */
  update(instanceId: string, patch: IndicatorInstancePatch): boolean {
    return this.deps.commands.update(instanceId, patch)
  }

  /** 迁移实例归属或在同一 Pane 内换位；归属变化时重置绘图历史。 */
  move(instanceId: string, target: InstanceMoveTarget): boolean {
    const before = this.find(instanceId)?.paneId
    if (!this.deps.commands.move(instanceId, target)) return false
    if (before !== this.find(instanceId)?.paneId) this.deps.invalidateDrawingHistory()
    return true
  }

  /** 删除实例；空副图一并回收。 */
  remove(instanceId: string): boolean {
    if (!this.deps.commands.remove(instanceId)) return false
    this.deps.invalidateDrawingHistory()
    return true
  }

  /** 删除指定定义创建的全部实例；定义注销与宿主清理共用。 */
  removeByDefinition(definitionId: string): void {
    this.deps.commands.removeByDefinition(definitionId)
    this.deps.invalidateDrawingHistory()
  }

  /** 删除当前工作区全部实例；副图回收后只保留主图与系统 Pane。 */
  clear(): void {
    this.deps.commands.clear()
    this.deps.invalidateDrawingHistory()
  }

  /** 按身份读取当前实例；不存在时返回 undefined。 */
  private find(instanceId: string): IndicatorInstance | undefined {
    return this.deps.manager.indicatorsComputed.peek().find((item) => item.id === instanceId)
  }
}
