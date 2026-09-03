/** PaneManager 统一管理 pane 布局与副图内容的原子领域变更。 */
import { batch } from '../foundation/reactivity/signal'
import { generateUUID } from '../foundation/utils/uuid'
import type { PaneSpec } from './chartTypes'
import type { IndicatorStateModule, SubPaneInput } from './state/indicatorState'
import type { PaneStateModule } from './state/paneState'

/** 可由用户界面和 Agent 共同提交的 pane 可更新字段。 */
export type PanePatch = Partial<Omit<PaneSpec, 'id'>>

/** PaneManager 的领域依赖，仅依赖业务状态而不依赖 DOM 或 renderer。 */
export interface PaneManagerDependencies {
  readonly pane: PaneStateModule
  readonly indicator: IndicatorStateModule
}

  /** 创建副图 pane 所需的内容；实例身份由 PaneManager 生成。 */
export type CreatePaneInput = Omit<SubPaneInput, 'instanceId' | 'ordinal'>

/**
 * 收敛 pane 领域写入，保证副图 pane 与对应 indicator instance 同批发布。
 * ChartPaneLayout 只消费这里写入的快照，不能反向成为领域状态入口。
 */
export class PaneManager {
  constructor(private readonly dependencies: PaneManagerDependencies) {}

  /** 对外唯一的 pane 领域写操作。 */
  readonly actions = {
    create: (input: CreatePaneInput) => this.create(input),
    update: (paneId: string, patch: PanePatch) => this.update(paneId, patch),
    remove: (paneId: string) => this.remove(paneId),
    move: (paneId: string, targetIndex: number) => this.move(paneId, targetIndex),
    replaceContent: (paneId: string, indicatorId: string, params: Readonly<Record<string, unknown>>) =>
      this.replaceContent(paneId, indicatorId, params),
    updateContent: (paneId: string, params: Readonly<Record<string, unknown>>) =>
      this.updateContent(paneId, params),
    clear: () => this.clear(),
  }

  /** 返回当前 pane 布局快照。 */
  list(): ReadonlyArray<PaneSpec> {
    return this.dependencies.pane.readonly.paneSpecs.peek()
  }

  /** 创建或更新一个带副图指标内容的 pane。 */
  /** 供指标领域创建已分配 identity 的副图 pane，不属于对外 Action。 */
  createFromIndicator(entry: SubPaneInput): boolean {
    return this.createEntry(entry)
  }

  private create(input: CreatePaneInput): boolean {
    const ordinal = this.dependencies.indicator.readonly.instances
      .peek()
      .filter((item) => item.role === 'sub' && item.indicatorId === input.indicatorId)
      .reduce((maximum, item) => Math.max(maximum, item.ordinal), -1) + 1
    return this.createEntry({ ...input, instanceId: generateUUID(), ordinal })
  }

  /** 写入已完整解析的副图实例与布局快照。 */
  private createEntry(entry: SubPaneInput): boolean {
    const { pane, indicator } = this.dependencies
    if (indicator.readonly.subPanes.peek().some((item) => item.paneId === entry.paneId)) {
      return false
    }

    const currentSpecs = pane.readonly.paneSpecs.peek()
    const nextSpecs = currentSpecs.some((item) => item.id === entry.paneId)
      ? currentSpecs.map((item) => ({ ...item }))
      : [...currentSpecs, { id: entry.paneId, ratio: 1, visible: true, role: 'indicator' as const }]
    const ratios = this.normalizeRatios(nextSpecs, entry.paneId, true)

    batch(() => {
      indicator.actions.upsertSub(entry)
      pane.actions.commitLayout(ratios, this.withRatios(nextSpecs, ratios))
    })
    return true
  }

  /** 删除一个 pane，并原子删除该 pane 上的用户副图指标。 */
  private remove(paneId: string): boolean {
    const { pane, indicator } = this.dependencies
    const currentSpecs = pane.readonly.paneSpecs.peek()
    if (!currentSpecs.some((item) => item.id === paneId)) return false

    const subPane = indicator.readonly.instances
      .peek()
      .find((item) => item.role === 'sub' && item.paneId === paneId)
    if (subPane?.source === 'mode') return false

    const nextSpecs = currentSpecs.filter((item) => item.id !== paneId)
    const ratios = this.normalizeRatios(nextSpecs)
    batch(() => {
      if (subPane) indicator.actions.removeSub(paneId)
      pane.actions.commitLayout(ratios, this.withRatios(nextSpecs, ratios))
    })
    return true
  }

  /** 修改单个 pane 的布局字段；不能通过 patch 改变 pane 身份。 */
  private update(paneId: string, patch: PanePatch): boolean {
    const currentSpecs = this.dependencies.pane.readonly.paneSpecs.peek()
    const index = currentSpecs.findIndex((item) => item.id === paneId)
    if (index < 0) return false

    const nextSpecs = currentSpecs.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch, id: paneId } : { ...item },
    )
    const ratios = this.normalizeRatios(nextSpecs)
    this.dependencies.pane.actions.commitLayout(ratios, this.withRatios(nextSpecs, ratios))
    return true
  }

  /** 调整 pane 的显示顺序，不改变其内容归属。 */
  private move(paneId: string, targetIndex: number): boolean {
    const currentSpecs = this.dependencies.pane.readonly.paneSpecs.peek()
    const index = currentSpecs.findIndex((item) => item.id === paneId)
    if (index < 0 || !Number.isInteger(targetIndex)) return false
    const boundedTarget = Math.max(0, Math.min(targetIndex, currentSpecs.length - 1))
    if (index === boundedTarget) return true

    const nextSpecs = currentSpecs.map((item) => ({ ...item }))
    const [moving] = nextSpecs.splice(index, 1)
    if (!moving) return false
    nextSpecs.splice(boundedTarget, 0, moving)
    const ratios = this.normalizeRatios(nextSpecs)
    this.dependencies.pane.actions.commitLayout(ratios, this.withRatios(nextSpecs, ratios))
    return true
  }

  /** 替换已有副图 pane 绑定的指标和完整参数。 */
  private replaceContent(
    paneId: string,
    indicatorId: string,
    params: Readonly<Record<string, unknown>>,
  ): boolean {
    const entry = this.dependencies.indicator.readonly.instances
      .peek()
      .find((item) => item.role === 'sub' && item.paneId === paneId)
    if (!entry || entry.source === 'mode') return false
    this.dependencies.indicator.actions.replaceSub({ paneId, indicatorId, params })
    return true
  }

  /** 更新已有副图 pane 的完整指标参数。 */
  private updateContent(paneId: string, params: Readonly<Record<string, unknown>>): boolean {
    const entry = this.dependencies.indicator.readonly.instances
      .peek()
      .find((item) => item.role === 'sub' && item.paneId === paneId)
    if (!entry || entry.source === 'mode') return false
    this.dependencies.indicator.actions.setSubParams(paneId, params)
    return true
  }

  /** 删除全部用户副图 pane 及其指标内容。 */
  private clear(): void {
    const { pane, indicator } = this.dependencies
    const subPaneIds = new Set(
      indicator.readonly.instances
        .peek()
        .filter((item) => item.role === 'sub' && item.source !== 'mode')
        .map((item) => item.paneId),
    )
    const nextSpecs = pane.readonly.paneSpecs.peek().filter((item) => !subPaneIds.has(item.id))
    const ratios = this.normalizeRatios(nextSpecs)
    batch(() => {
      indicator.actions.clearSub()
      pane.actions.commitLayout(ratios, this.withRatios(nextSpecs, ratios))
    })
  }

  /** 受控导入完整布局；删除的用户副图内容随 pane 一并清理。 */
  replaceLayoutForImport(specs: ReadonlyArray<PaneSpec>): void {
    const nextSpecs = specs.map((item) => ({ ...item }))
    const nextIds = new Set(nextSpecs.map((item) => item.id))
    const removedSubPaneIds = this.dependencies.indicator.readonly.instances
      .peek()
      .filter((item) => item.role === 'sub' && item.source !== 'mode' && !nextIds.has(item.paneId))
      .map((item) => item.paneId)
    // 完整布局导入以调用方快照为准，不能继承上一帧的 ratio。
    const visible = nextSpecs.filter((item) => item.visible !== false)
    const total =
      visible.reduce((sum, item) => sum + (Number.isFinite(item.ratio) ? item.ratio : 1), 0) || 1
    const ratios: Record<string, number> = {}
    for (const item of nextSpecs) {
      const value = Number.isFinite(item.ratio) ? item.ratio : 1
      ratios[item.id] = item.visible === false ? value : value / total
    }
    batch(() => {
      for (const paneId of removedSubPaneIds) this.dependencies.indicator.actions.removeSub(paneId)
      this.dependencies.pane.actions.commitLayout(ratios, this.withRatios(nextSpecs, ratios))
    })
  }

  /** 依据当前布局快照生成可提交的归一化比例。 */
  private normalizeRatios(
    specs: ReadonlyArray<PaneSpec>,
    createdPaneId?: string,
    applySubPaneDefault = false,
  ): Record<string, number> {
    const raw = { ...this.dependencies.pane.readonly.paneRatios.peek() }
    if (applySubPaneDefault && createdPaneId) {
      const visible = specs.filter((item) => item.visible !== false)
      const pricePanes = visible.filter((item) => item.role === 'price')
      if (pricePanes.length === 1) {
        raw[pricePanes[0]!.id] = 3
        for (const item of visible) {
          if (item.role === 'indicator') raw[item.id] = 1
        }
      } else {
        raw[createdPaneId] = 1
      }
    }

    const visible = specs.filter((item) => item.visible !== false)
    const total = visible.reduce((sum, item) => sum + (raw[item.id] ?? item.ratio ?? 1), 0) || 1
    const ratios: Record<string, number> = {}
    for (const item of specs) {
      const value = raw[item.id] ?? item.ratio ?? 1
      ratios[item.id] = item.visible === false ? value : value / total
    }
    return ratios
  }

  /** 将 ratios 同步到 spec，保证单次提交的两个字段表达同一快照。 */
  private withRatios(specs: ReadonlyArray<PaneSpec>, ratios: Readonly<Record<string, number>>): PaneSpec[] {
    return specs.map((item) => ({ ...item, ratio: ratios[item.id] ?? item.ratio }))
  }
}
