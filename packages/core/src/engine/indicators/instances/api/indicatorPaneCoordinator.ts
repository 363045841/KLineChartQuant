/**
 * pane 与指标实例的原子协调器。
 *
 * 它只依赖新实例 CRUD API 和 pane 布局状态，不依赖旧 IndicatorState/Panemanager。
 * pane 是布局资源；指标实例是内容资源；两者的创建、移动和删除必须同一事务发布。
 */

import type { PaneSpec } from '@/engine/chartTypes.js'
import type { PaneStateModule } from '@/engine/state/paneState.js'
import { batch } from '@/foundation/reactivity/signal.js'
import type {
  CreateIndicatorInstance,
  IndicatorInstance,
  IndicatorPaneId,
  UpdateIndicatorInstance,
} from '../domain/instanceModel.js'
import type { IndicatorInstanceApi } from './indicatorInstanceApi.js'

export interface IndicatorPaneCoordinatorDependencies {
  readonly pane: PaneStateModule
  readonly instances: IndicatorInstanceApi
}

export type CreateIndicatorPaneInput = Omit<CreateIndicatorInstance, 'paneId'> & {
  readonly paneId: IndicatorPaneId
  readonly pane?: Partial<Omit<PaneSpec, 'id' | 'role'>>
}

/** 只管理被指标实例占用的 indicator pane。 */
export class IndicatorPaneCoordinator {
  constructor(private readonly dependencies: IndicatorPaneCoordinatorDependencies) {}

  /** 创建一个副图 pane 及其唯一实例。 */
  create(input: CreateIndicatorPaneInput): IndicatorInstance {
    const existingPane = this.findPane(input.paneId)
    if (existingPane) throw new TypeError(`Indicator pane already exists: ${input.paneId}`)
    if (this.instancesInPane(input.paneId).length > 0) {
      throw new TypeError(`Indicator pane already has instances: ${input.paneId}`)
    }
    let instance: IndicatorInstance | undefined
    batch(() => {
      const specs = this.dependencies.pane.readonly.paneSpecs.peek()
      const next = [
        ...specs,
        {
          id: input.paneId,
          role: 'indicator' as const,
          visible: true,
          ratio: 1,
          ...input.pane,
        },
      ]
      this.commitLayout(next)
      const { pane: _pane, ...instanceInput } = input
      instance = this.dependencies.instances.create({
        ...instanceInput,
        paneId: input.paneId,
        presentation: input.presentation ?? {},
      })
    })
    return instance!
  }

  /** 删除 indicator pane 及其全部实例。主图 pane 不属于此协调器。 */
  remove(paneId: IndicatorPaneId): boolean {
    const pane = this.findPane(paneId)
    if (!pane || pane.role !== 'indicator') return false
    batch(() => {
      for (const instance of this.instancesInPane(paneId)) {
        this.dependencies.instances.remove(instance.instanceId)
      }
      this.commitLayout(
        this.dependencies.pane.readonly.paneSpecs.peek().filter((item) => item.id !== paneId),
      )
    })
    return true
  }

  /** 将一个实例移动到已有 pane；目标 pane 必须存在。 */
  moveInstance(instanceId: string, paneId: IndicatorPaneId): IndicatorInstance {
    if (!this.findPane(paneId)) throw new TypeError(`Unknown target pane: ${paneId}`)
    return this.dependencies.instances.update(instanceId, {
      kind: 'presentation',
      paneId,
    })
  }

  /** 原子替换 pane 内唯一实例的指标定义与计算身份。 */
  replaceInstance(
    paneId: IndicatorPaneId,
    input: Pick<CreateIndicatorInstance, 'definitionId' | 'calculation'>,
  ): IndicatorInstance {
    const [current] = this.instancesInPane(paneId)
    if (!current) throw new TypeError(`Indicator pane has no instance: ${paneId}`)
    // definitionId 变化不能伪装为参数 patch；直接删除并以同一 pane 创建新实例。
    if (current.definitionId !== input.definitionId) {
      const presentation = current.presentation
      this.dependencies.instances.remove(current.instanceId)
      return this.dependencies.instances.create({ ...input, paneId, presentation })
    }
    return this.dependencies.instances.update(current.instanceId, {
      kind: 'calculation',
      params: input.calculation.params,
      context: input.calculation.context,
    })
  }

  updateInstance(instanceId: string, change: UpdateIndicatorInstance): IndicatorInstance {
    return this.dependencies.instances.update(instanceId, change)
  }

  list(paneId: IndicatorPaneId): readonly IndicatorInstance[] {
    return this.instancesInPane(paneId)
  }

  private findPane(paneId: string): PaneSpec | undefined {
    return this.dependencies.pane.readonly.paneSpecs.peek().find((pane) => pane.id === paneId)
  }

  private instancesInPane(paneId: string): readonly IndicatorInstance[] {
    return this.dependencies.instances.listByPane(paneId)
  }

  private commitLayout(specs: readonly PaneSpec[]): void {
    const visible = specs.filter((item) => item.visible !== false)
    const total = visible.reduce((sum, item) => sum + (item.ratio ?? 1), 0) || 1
    const ratios: Record<string, number> = {}
    for (const pane of specs) {
      const value = pane.ratio ?? 1
      ratios[pane.id] = pane.visible === false ? value : value / total
    }
    this.dependencies.pane.actions.commitLayout(
      ratios,
      specs.map((pane) => ({ ...pane, ratio: ratios[pane.id] ?? pane.ratio })),
    )
  }
}
