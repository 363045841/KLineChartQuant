/**
 * PaneManager —— 实例归属与 Pane 容器的唯一领域写入口。
 *
 * 主图与副图共用同一套实例命令：add / moveInstance / removeInstance /
 * updateInstance / clearAllIndicators。
 * Pane 容器操作只管理顺序、高度和可见性，不承担指标内容语义。
 */
import { batch } from '../../../foundation/reactivity/signal.js'
import { generateUUID } from '../../../foundation/utils/uuid.js'
import { resolveDefinitionDefaultParams } from '../../indicators/defaultParams.js'
import { createIndicatorInstanceId } from '../../indicators/instances/api/instanceIdentity.js'
import { INDICATOR_ROLE, type IndicatorInstanceRole } from '../../state/indicatorRole.js'
import type { IndicatorInstancePatch, IndicatorInstanceSpec } from '../../state/indicatorState.js'
import { indicatorInstanceAxisKey } from '../instanceAxisKey.js'
import type {
  InstanceMoveTarget,
  PaneLayoutCommands,
  PaneManagerDependencies,
  PanePatch,
  PaneSpec,
} from '../types.js'
import { INSTANCE_MOVE_KIND, MAIN_PANE_ID } from '../types.js'
import { normalizeVisiblePaneRatios } from './layout/paneRatioMath.js'
import { paneSpecsEqual } from './paneConfiguration.js'

/** 目标 Pane 解析结果：容器身份 + 实例角色 + 是否需要新建 Pane。 */
interface ResolvedTarget {
  readonly paneId: string
  readonly role: IndicatorInstanceRole
  readonly insert?: { readonly anchorPaneId: string; readonly placement: 'above' | 'below' }
}

export class PaneManager {
  constructor(private readonly dependencies: PaneManagerDependencies) {}

  /** 对外唯一布局写入口。 */
  readonly actions: PaneLayoutCommands = {
    add: (definitionId, params, target) => this.add(definitionId, params, target),
    moveInstance: (instanceId, target) => this.moveInstance(instanceId, target),
    removeInstance: (instanceId) => this.removeInstance(instanceId),
    updateInstance: (instanceId, patch) => this.updateInstance(instanceId, patch),
    updatePane: (paneId, patch) => this.updatePane(paneId, patch),
    movePane: (paneId, targetIndex) => this.movePane(paneId, targetIndex),
    reorderPanes: (paneIds) => this.reorderPanes(paneIds),
    removePane: (paneId) => this.removePane(paneId),
    removeInstancesByDefinition: (definitionId) => this.removeInstancesByDefinition(definitionId),
    clearAllIndicators: () => this.clearAllIndicators(),
    clearPanes: () => this.clearPanes(),
    importLayout: (specs) => this.importLayout(specs),
    getLayoutSpecs: () => [...this.list()],
    hasPane: (paneId) => this.list().some((spec) => spec.id === paneId),
  }

  /** 返回当前 pane 布局快照。 */
  list(): ReadonlyArray<PaneSpec> {
    return this.dependencies.pane.readonly.paneSpecs.peek()
  }

  /** 创建实例；主图定义默认进主图，其余默认在最后一个 Pane 下方新建副图。 */
  private add(
    definitionId: string,
    params: Readonly<Record<string, unknown>> | undefined,
    target: InstanceMoveTarget | undefined,
  ): string | null {
    const definition = this.dependencies.getDefinition(definitionId)
    if (!definition) return null
    const specs = this.list()
    const resolved =
      target === undefined
        ? definition.category === 'main'
          ? { paneId: MAIN_PANE_ID, role: INDICATOR_ROLE.MAIN }
          : {
              paneId: generateUUID(),
              role: INDICATOR_ROLE.SUB,
              insert: {
                anchorPaneId: specs[specs.length - 1]?.id ?? MAIN_PANE_ID,
                placement: 'below' as const,
              },
            }
        : this.resolveTarget(target, specs)
    if (!resolved) return null

    const nextSpecs = resolved.insert
      ? this.insertPaneSpec(specs, resolved.paneId, resolved.insert)
      : specs
    const ratios = this.normalizeRatios(nextSpecs, resolved.insert ? resolved.paneId : undefined)
    const instanceId = createIndicatorInstanceId()
    const ordinal = this.nextOrdinal(resolved.paneId)
    batch(() => {
      this.dependencies.indicator.actions.addInstance({
        instanceId,
        indicatorId: definition.name,
        paneId: resolved.paneId,
        role: resolved.role,
        ordinal,
        params: {
          ...resolveDefinitionDefaultParams(definition),
          ...(params ?? {}),
        },
      })
      this.dependencies.pane.actions.commitLayout(this.withRatios(nextSpecs, ratios))
    })
    return instanceId
  }

  /**
   * 移动实例：目标 pane 与当前相同即同一 Pane 内换位，否则迁移归属。
   *
   * 目标位置在目标 Pane 内按 ordinal 顺序解释；`index` 缺省放到末尾。
   * 源副图移出最后一个实例后回收，目标新建时按锚点插入。
   */
  private moveInstance(instanceId: string, target: InstanceMoveTarget): boolean {
    const { indicator, pane } = this.dependencies
    const previous = indicator.readonly.instances.peek()
    const current = previous.find((instance) => instance.instanceId === instanceId)
    if (!current) return false

    const specs = this.list()
    const resolved = this.resolveTarget(target, specs)
    if (!resolved) return false

    const index = target.kind === INSTANCE_MOVE_KIND.NEW_PANE ? undefined : target.index
    if (resolved.paneId === current.paneId)
      return this.reorderWithinPane(instanceId, current.paneId, index)

    let nextSpecs = resolved.insert
      ? this.insertPaneSpec(specs, resolved.paneId, resolved.insert)
      : specs
    // 源副图移出最后一个实例后不再保留空容器。
    if (
      current.role === INDICATOR_ROLE.SUB &&
      !previous.some(
        (instance) => instance.instanceId !== instanceId && instance.paneId === current.paneId,
      )
    ) {
      nextSpecs = nextSpecs.filter((spec) => spec.id !== current.paneId)
    }
    const ratios = this.normalizeRatios(nextSpecs, resolved.insert ? resolved.paneId : undefined)
    // 迁移后按目标位置重排整个目标 Pane，ordinal 不出现空洞或重复。
    const ordered = this.paneInstanceIds(previous, resolved.paneId, instanceId)
    const insertAt =
      index === undefined ? ordered.length : Math.max(0, Math.min(index, ordered.length))
    ordered.splice(insertAt, 0, instanceId)
    batch(() => {
      indicator.actions.moveInstance(
        instanceId,
        resolved.paneId,
        resolved.role,
        this.nextOrdinal(resolved.paneId, instanceId),
      )
      indicator.actions.applyPaneInstanceOrder(resolved.paneId, ordered)
      pane.actions.commitLayout(this.withRatios(nextSpecs, ratios))
      if (current.paneId !== MAIN_PANE_ID && !nextSpecs.some((spec) => spec.id === current.paneId))
        pane.actions.removePaneScaleType(current.paneId)
    })
    return true
  }

  /** 同一 Pane 内按目标位置换位；位置越界时收敛到首尾。 */
  private reorderWithinPane(instanceId: string, paneId: string, index?: number): boolean {
    const instances = this.dependencies.indicator.readonly.instances.peek()
    const ordered = this.paneInstanceIds(instances, paneId, instanceId)
    const insertAt =
      index === undefined ? ordered.length : Math.max(0, Math.min(index, ordered.length))
    ordered.splice(insertAt, 0, instanceId)
    return this.dependencies.indicator.actions.applyPaneInstanceOrder(paneId, ordered)
  }

  /** 读取指定 Pane 内除目标外的实例身份，按 ordinal 升序排列。 */
  private paneInstanceIds(
    instances: ReadonlyArray<IndicatorInstanceSpec>,
    paneId: string,
    excludeInstanceId: string,
  ): string[] {
    return instances
      .filter((instance) => instance.paneId === paneId && instance.instanceId !== excludeInstanceId)
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((instance) => instance.instanceId)
  }

  /** 删除实例；空副图一并回收，独立轴偏好随实例删除。 */
  private removeInstance(instanceId: string): boolean {
    const current = this.dependencies.indicator.readonly.instances
      .peek()
      .find((instance) => instance.instanceId === instanceId)
    if (!current) return false
    this.removeInstances([current])
    return true
  }

  /**
   * 批量删除实例并回收失去全部实例的副图。
   *
   * 只处理被删实例占用的副图：仍有其它实例的 Pane、主图和系统 Pane 都保留。
   */
  private removeInstances(instances: ReadonlyArray<IndicatorInstanceSpec>): void {
    if (instances.length === 0) return
    const { indicator, pane } = this.dependencies
    const removedIds = new Set(instances.map((instance) => instance.instanceId))
    const remaining = indicator.readonly.instances
      .peek()
      .filter((instance) => !removedIds.has(instance.instanceId))
    const occupiedPaneIds = new Set(
      remaining
        .filter((instance) => instance.role === INDICATOR_ROLE.SUB)
        .map((instance) => instance.paneId),
    )
    const touchedPaneIds = new Set(
      instances
        .filter((instance) => instance.role === INDICATOR_ROLE.SUB)
        .map((instance) => instance.paneId),
    )
    const nextSpecs = this.list().filter(
      (spec) => !touchedPaneIds.has(spec.id) || occupiedPaneIds.has(spec.id),
    )
    const ratios = this.normalizeRatios(nextSpecs)
    batch(() => {
      for (const instance of instances) this.detachInstance(instance.instanceId)
      pane.actions.commitLayout(this.withRatios(nextSpecs, ratios))
    })
  }

  /** 删除实例自身与实例级轴偏好；布局由调用方在 batch 内统一提交。 */
  private detachInstance(instanceId: string): void {
    this.dependencies.indicator.actions.removeInstance(instanceId)
    this.dependencies.pane.actions.removePaneScaleType(indicatorInstanceAxisKey(instanceId))
  }

  /** 更新实例参数、显隐、排序或定义；归属变化走 moveInstance。 */
  private updateInstance(instanceId: string, patch: IndicatorInstancePatch): boolean {
    const { indicator } = this.dependencies
    const current = indicator.readonly.instances
      .peek()
      .find((instance) => instance.instanceId === instanceId)
    if (!current) return false
    if (patch.indicatorId !== undefined) {
      const definition = this.dependencies.getDefinition(patch.indicatorId)
      if (!definition) return false
      return indicator.actions.updateInstance(instanceId, {
        ...patch,
        indicatorId: definition.name,
        params: { ...resolveDefinitionDefaultParams(definition), ...(patch.params ?? {}) },
      })
    }
    return indicator.actions.updateInstance(instanceId, patch)
  }

  /** 修改单个 pane 的布局字段；不能通过 patch 改变 pane 身份。 */
  private updatePane(paneId: string, patch: PanePatch): boolean {
    if (patch.ratio !== undefined && (!Number.isFinite(patch.ratio) || patch.ratio <= 0))
      return false
    if (
      patch.minHeightPx !== undefined &&
      (!Number.isFinite(patch.minHeightPx) || patch.minHeightPx <= 0)
    )
      return false
    const currentSpecs = this.list()
    const index = currentSpecs.findIndex((item) => item.id === paneId)
    if (index < 0) return false
    const nextSpecs = currentSpecs.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch, id: paneId } : { ...item },
    )
    if (paneSpecsEqual(currentSpecs, nextSpecs)) return true
    const ratios = this.normalizeRatios(nextSpecs)
    this.dependencies.pane.actions.commitLayout(this.withRatios(nextSpecs, ratios))
    return true
  }

  /** 调整 pane 的显示顺序，不改变其内容归属。 */
  private movePane(paneId: string, targetIndex: number): boolean {
    const currentSpecs = this.list()
    const index = currentSpecs.findIndex((item) => item.id === paneId)
    if (index < 0 || !Number.isInteger(targetIndex)) return false
    const boundedTarget = Math.max(0, Math.min(targetIndex, currentSpecs.length - 1))
    if (index === boundedTarget) return true
    const nextSpecs = currentSpecs.map((item) => ({ ...item }))
    const [moving] = nextSpecs.splice(index, 1)
    if (!moving) return false
    nextSpecs.splice(boundedTarget, 0, moving)
    this.dependencies.pane.actions.commitLayout(nextSpecs)
    return true
  }

  /** 完整顺序按持久 paneId 寻址，一次提交，拒绝缺失或重复身份。 */
  private reorderPanes(paneIds: ReadonlyArray<string>): boolean {
    const specs = this.list()
    const byId = new Map(specs.map((pane) => [pane.id, pane]))
    if (
      paneIds.length !== specs.length ||
      new Set(paneIds).size !== specs.length ||
      paneIds.some((id) => !byId.has(id))
    )
      return false
    this.dependencies.pane.actions.commitLayout(paneIds.map((id) => byId.get(id)!))
    return true
  }

  /** 删除 Pane 及其全部用户实例；主图不可删除。 */
  private removePane(paneId: string): boolean {
    const { pane } = this.dependencies
    if (paneId === MAIN_PANE_ID) return false
    const currentSpecs = this.list()
    if (!currentSpecs.some((item) => item.id === paneId)) return false
    const instances = this.dependencies.indicator.readonly.instances
      .peek()
      .filter((instance) => instance.paneId === paneId)
    const nextSpecs = currentSpecs.filter((item) => item.id !== paneId)
    const ratios = this.normalizeRatios(nextSpecs)
    batch(() => {
      for (const instance of instances) this.detachInstance(instance.instanceId)
      pane.actions.commitLayout(this.withRatios(nextSpecs, ratios))
    })
    return true
  }

  /** 删除全部用户副图及其实例，保留主图。 */
  private clearPanes(): void {
    this.removeInstances(
      this.dependencies.indicator.readonly.instances
        .peek()
        .filter((instance) => instance.role === INDICATOR_ROLE.SUB),
    )
  }

  /** 删除指定定义创建的全部实例；定义注销与宿主清理共用。 */
  private removeInstancesByDefinition(definitionId: string): void {
    this.removeInstances(
      this.dependencies.indicator.readonly.instances
        .peek()
        .filter((instance) => instance.indicatorId === definitionId),
    )
  }

  /** 一次提交删除主图与副图全部实例，副图容器随之回收。 */
  private clearAllIndicators(): void {
    this.removeInstances(this.dependencies.indicator.readonly.instances.peek())
  }

  /** 受控导入完整布局；删除的用户副图内容随 pane 一并清理。 */
  importLayout(specs: ReadonlyArray<PaneSpec>): void {
    const nextSpecs = specs.map((item) => ({ ...item }))
    const nextIds = new Set(nextSpecs.map((item) => item.id))
    const removed = this.dependencies.indicator.readonly.instances
      .peek()
      .filter((item) => item.role === INDICATOR_ROLE.SUB && !nextIds.has(item.paneId))
    // 完整布局导入以调用方快照为准，不能继承上一帧的 ratio。
    const ratios = this.buildRatios(nextSpecs, (item) =>
      Number.isFinite(item.ratio) ? item.ratio : 1,
    )
    batch(() => {
      for (const instance of removed) this.detachInstance(instance.instanceId)
      this.dependencies.pane.actions.commitLayout(this.withRatios(nextSpecs, ratios))
    })
  }

  /** 目标解析：已有 Pane 必须存在，新建 Pane 保留锚点与方向。 */
  private resolveTarget(
    target: InstanceMoveTarget,
    specs: ReadonlyArray<PaneSpec>,
  ): ResolvedTarget | null {
    if (target.kind === INSTANCE_MOVE_KIND.MAIN)
      return { paneId: MAIN_PANE_ID, role: INDICATOR_ROLE.MAIN }
    if (target.kind === INSTANCE_MOVE_KIND.PANE) {
      if (!specs.some((spec) => spec.id === target.paneId)) return null
      return {
        paneId: target.paneId,
        role: target.paneId === MAIN_PANE_ID ? INDICATOR_ROLE.MAIN : INDICATOR_ROLE.SUB,
      }
    }
    if (!specs.some((spec) => spec.id === target.anchorPaneId)) return null
    return {
      paneId: generateUUID(),
      role: INDICATOR_ROLE.SUB,
      insert: { anchorPaneId: target.anchorPaneId, placement: target.placement },
    }
  }

  /** 在锚点上方或下方插入新 Pane。 */
  private insertPaneSpec(
    specs: ReadonlyArray<PaneSpec>,
    paneId: string,
    insert: { readonly anchorPaneId: string; readonly placement: 'above' | 'below' },
  ): PaneSpec[] {
    const next = specs.map((spec) => ({ ...spec }))
    const anchorIndex = next.findIndex((spec) => spec.id === insert.anchorPaneId)
    const index = insert.placement === 'above' ? anchorIndex : anchorIndex + 1
    next.splice(index, 0, this.createPaneSpec(paneId))
    return next
  }

  /** 新 Pane 的初始规格；比例由归一化统一分配。 */
  private createPaneSpec(paneId: string): PaneSpec {
    return { id: paneId, ratio: 1, visible: true, role: 'indicator' }
  }

  /** 目标 Pane 的下一个显示序号；可排除正在迁移的实例。 */
  private nextOrdinal(paneId: string, excludeInstanceId?: string): number {
    return (
      this.dependencies.indicator.readonly.instances
        .peek()
        .filter(
          (instance) => instance.paneId === paneId && instance.instanceId !== excludeInstanceId,
        )
        .reduce((maximum, instance) => Math.max(maximum, instance.ordinal), -1) + 1
    )
  }

  /** 依据当前布局快照生成可提交的归一化比例。 */
  private normalizeRatios(
    specs: ReadonlyArray<PaneSpec>,
    createdPaneId?: string,
  ): Record<string, number> {
    const raw = Object.fromEntries(specs.map((spec) => [spec.id, spec.ratio]))
    if (createdPaneId) {
      const visible = specs.filter((item) => item.visible !== false)
      const pricePanes = visible.filter((item) => item.role === 'price')
      if (pricePanes.length === 1) {
        // 只分配新窗格的份额，已有窗格之间的用户比例保持不变。
        const existing = visible.filter((item) => item.id !== createdPaneId)
        const total = existing.reduce((sum, item) => sum + raw[item.id]!, 0)
        raw[createdPaneId] = total / (existing.length + 2)
      } else {
        raw[createdPaneId] = 1
      }
    }
    return this.buildRatios(specs, (item) => raw[item.id]!)
  }

  /**
   * 由每个 pane 的原始权重生成可提交的归一化比例。
   * 隐藏 pane 保留原值、不参与归一化；可见 pane 按可见总和归一。
   */
  private buildRatios(
    specs: ReadonlyArray<PaneSpec>,
    rawValueOf: (item: PaneSpec) => number,
  ): Record<string, number> {
    return normalizeVisiblePaneRatios(
      specs,
      Object.fromEntries(specs.map((item) => [item.id, rawValueOf(item)])),
    )
  }

  /** 将 ratios 同步到 spec，保证单次提交的两个字段表达同一快照。 */
  private withRatios(
    specs: ReadonlyArray<PaneSpec>,
    ratios: Readonly<Record<string, number>>,
  ): PaneSpec[] {
    return specs.map((item) => ({ ...item, ratio: ratios[item.id]! }))
  }
}

/** 供测试与调试读取实例所在 Pane 的轻量查询。 */
export function findInstance(
  instances: ReadonlyArray<IndicatorInstanceSpec>,
  instanceId: string,
): IndicatorInstanceSpec | undefined {
  return instances.find((instance) => instance.instanceId === instanceId)
}
